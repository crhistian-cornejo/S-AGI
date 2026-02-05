/**
 * S-AGI Session Client
 * WebSocket client for real-time session synchronization
 */

(function() {
  'use strict';

  // DOM Elements
  const messagesContainer = document.getElementById('messages');
  const chatTitle = document.getElementById('chat-title');
  const hostName = document.getElementById('host-name');
  const clientCount = document.getElementById('client-count');
  const connectionStatus = document.getElementById('connection-status');
  const typingIndicator = document.getElementById('typing-indicator');
  const sessionEndedOverlay = document.getElementById('session-ended');
  const themeToggle = document.getElementById('theme-toggle');

  // State
  let ws = null;
  let reconnectAttempts = 0;
  const MAX_RECONNECT_ATTEMPTS = 5;
  let emptyStateRendered = false;

  // Theme Management
  function initTheme() {
    const savedTheme = localStorage.getItem('sagi-session-theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
      document.documentElement.classList.add('dark');
    }
  }

  function toggleTheme() {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('sagi-session-theme', isDark ? 'dark' : 'light');
  }

  themeToggle.addEventListener('click', toggleTheme);
  initTheme();

  // WebSocket Connection
  function connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    console.log('[Session] Connecting to', wsUrl);
    ws = new WebSocket(wsUrl);

    ws.onopen = function() {
      console.log('[Session] Connected');
      connectionStatus.textContent = 'Connected';
      connectionStatus.classList.remove('disconnected');
      reconnectAttempts = 0;
    };

    ws.onmessage = function(event) {
      try {
        const message = JSON.parse(event.data);
        handleMessage(message);
      } catch (err) {
        console.error('[Session] Failed to parse message:', err);
      }
    };

    ws.onclose = function() {
      console.log('[Session] Disconnected');
      connectionStatus.textContent = 'Disconnected';
      connectionStatus.classList.add('disconnected');
      
      // Try to reconnect
      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++;
        console.log(`[Session] Reconnecting (attempt ${reconnectAttempts})...`);
        setTimeout(connect, 2000 * reconnectAttempts);
      }
    };

    ws.onerror = function(err) {
      console.error('[Session] WebSocket error:', err);
    };
  }

  // Message Handlers
  function handleMessage(message) {
    switch (message.type) {
      case 'init':
        handleInit(message.payload);
        break;
      case 'message':
        handleNewMessage(message.payload);
        break;
      case 'typing':
        handleTyping(message.payload);
        break;
      case 'theme':
        handleThemeUpdate(message.payload);
        break;
      case 'system':
        handleSystem(message.payload);
        break;
      default:
        console.log('[Session] Unknown message type:', message.type);
    }
  }

  function handleInit(state) {
    console.log('[Session] Initializing with state:', state);
    
    // Update header
    chatTitle.textContent = state.chatTitle || 'S-AGI Session';
    hostName.textContent = state.hostName || 'Unknown';
    
    // Update theme if host has preference
    if (state.theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else if (state.theme === 'light') {
      document.documentElement.classList.remove('dark');
    }
    
    // Clear existing messages
    messagesContainer.innerHTML = '';
    emptyStateRendered = false;
    
    // Render all messages
    if (state.messages && state.messages.length > 0) {
      state.messages.forEach(msg => renderMessage(msg));
      clearEmptyState();
    } else {
      renderEmptyState();
    }
    
    // Scroll to bottom
    scrollToBottom();
  }

  function handleNewMessage(msg) {
    renderMessage(msg);
    clearEmptyState();
    scrollToBottom();
    
    // Hide typing indicator when assistant message arrives
    if (msg.role === 'assistant') {
      typingIndicator.classList.add('hidden');
    }
  }

  function handleTyping(data) {
    if (data.role === 'assistant') {
      if (data.isTyping) {
        typingIndicator.classList.remove('hidden');
      } else {
        typingIndicator.classList.add('hidden');
      }
    }
  }

  function handleThemeUpdate(data) {
    if (data.theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }

  function handleSystem(data) {
    if (data.clientCount !== undefined) {
      clientCount.textContent = `${data.clientCount} connected`;
    }
    
    if (data.message === 'Session ended by host') {
      sessionEndedOverlay.classList.remove('hidden');
      ws.close();
    }
  }

  // Render Message
  function renderMessage(msg) {
    const role = msg.role || 'assistant';
    const messageEl = document.createElement('div');
    messageEl.className = `message ${role}`;
    
    const bodyEl = document.createElement('div');
    bodyEl.className = 'message-body';

    const contentEl = document.createElement('div');
    contentEl.className = 'message-content';
    const contentText = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
    contentEl.innerHTML = renderMarkdown(contentText);
    
    // Add timestamp
    if (msg.createdAt) {
      const timeEl = document.createElement('div');
      timeEl.className = 'message-time';
      timeEl.textContent = formatTime(msg.createdAt);
      bodyEl.appendChild(timeEl);
    }

    bodyEl.prepend(contentEl);

    if (role === 'user') {
      const badgeEl = document.createElement('div');
      badgeEl.className = 'message-user-badge';
      badgeEl.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
          <circle cx="12" cy="7" r="4"/>
        </svg>
      `;
      messageEl.appendChild(bodyEl);
      messageEl.appendChild(badgeEl);
    } else {
      messageEl.appendChild(bodyEl);
    }
    messagesContainer.appendChild(messageEl);
  }

  // Markdown Renderer
  function renderMarkdown(text) {
    if (!text) return '';

    if (window.marked) {
      const renderer = new window.marked.Renderer();

      renderer.code = function(code, infostring) {
        const lang = (infostring || '').trim().split(/\s+/)[0];
        const escaped = escapeHtml(code);
        const label = lang ? lang.toUpperCase() : 'CODE';
        const langClass = lang ? `language-${lang}` : '';
        return `
          <div class="code-block">
            <div class="code-header">
              <span class="code-lang">${label}</span>
              <button class="code-copy" type="button">Copy</button>
            </div>
            <pre><code class="${langClass}">${escaped}</code></pre>
          </div>
        `;
      };

      renderer.link = function(href, title, text) {
        const safeHref = href || '#';
        const safeTitle = title ? ` title="${escapeHtml(title)}"` : '';
        return `<a href="${safeHref}"${safeTitle} target="_blank" rel="noopener noreferrer">${text}</a>`;
      };

      renderer.table = function(header, body) {
        return `
          <div class="table-block">
            <div class="table-wrap">
              <table>
                <thead>${header}</thead>
                <tbody>${body}</tbody>
              </table>
            </div>
          </div>
        `;
      };

      window.marked.setOptions({
        gfm: true,
        breaks: true,
        headerIds: false,
        mangle: false
      });

      const rawHtml = window.marked.parse(text, { renderer });
      return sanitizeHtml(rawHtml);
    }

    // Fallback: basic formatting
    const escaped = escapeHtml(text);
    const html = escaped.replace(/\n/g, '<br>');
    return `<p>${html}</p>`;
  }

  function sanitizeHtml(html) {
    if (window.DOMPurify) {
      return window.DOMPurify.sanitize(html, {
        ADD_ATTR: ['target', 'rel', 'class']
      });
    }
    return html;
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Utilities
  function formatTime(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function scrollToBottom() {
    const container = document.querySelector('.messages-container');
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }

  function renderEmptyState() {
    if (emptyStateRendered) return;
    const emptyEl = document.createElement('div');
    emptyEl.className = 'empty-state';
    emptyEl.id = 'empty-state';
    emptyEl.innerHTML = `
      <div class="empty-icon">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
          <path d="M12 2L2 7l10 5 10-5-10-5z"/>
          <path d="M2 17l10 5 10-5"/>
          <path d="M2 12l10 5 10-5"/>
        </svg>
      </div>
      <h2>Waiting for the host...</h2>
      <p>Messages will appear here in real time.</p>
    `;
    messagesContainer.appendChild(emptyEl);
    emptyStateRendered = true;
  }

  function clearEmptyState() {
    if (!emptyStateRendered) return;
    const emptyEl = document.getElementById('empty-state');
    if (emptyEl) {
      emptyEl.remove();
    }
    emptyStateRendered = false;
  }

  function setupCopyHandlers() {
    messagesContainer.addEventListener('click', function(event) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest('.code-copy');
      if (!button) return;
      const block = button.closest('.code-block');
      const codeEl = block ? block.querySelector('pre code') : null;
      const codeText = codeEl ? codeEl.textContent || '' : '';
      if (!codeText) return;
      navigator.clipboard.writeText(codeText).then(() => {
        button.classList.add('copied');
        button.textContent = 'Copied';
        setTimeout(() => {
          button.classList.remove('copied');
          button.textContent = 'Copy';
        }, 1500);
      });
    });
  }

  // Initialize
  setupCopyHandlers();
  connect();
})();
