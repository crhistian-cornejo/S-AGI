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
    
    // Render all messages
    if (state.messages && state.messages.length > 0) {
      state.messages.forEach(msg => renderMessage(msg));
    }
    
    // Scroll to bottom
    scrollToBottom();
  }

  function handleNewMessage(msg) {
    renderMessage(msg);
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
    const messageEl = document.createElement('div');
    messageEl.className = `message ${msg.role}`;
    
    const avatarEl = document.createElement('div');
    avatarEl.className = 'message-avatar';
    
    if (msg.role === 'user') {
      avatarEl.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
          <circle cx="12" cy="7" r="4"/>
        </svg>
      `;
    } else {
      avatarEl.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 2L2 7l10 5 10-5-10-5z"/>
          <path d="M2 17l10 5 10-5"/>
          <path d="M2 12l10 5 10-5"/>
        </svg>
      `;
    }
    
    const contentEl = document.createElement('div');
    contentEl.className = 'message-content';
    contentEl.innerHTML = renderMarkdown(msg.content);
    
    // Add timestamp
    if (msg.createdAt) {
      const timeEl = document.createElement('div');
      timeEl.className = 'message-time';
      timeEl.textContent = formatTime(msg.createdAt);
      contentEl.appendChild(timeEl);
    }
    
    messageEl.appendChild(avatarEl);
    messageEl.appendChild(contentEl);
    messagesContainer.appendChild(messageEl);
  }

  // Simple Markdown Renderer
  function renderMarkdown(text) {
    if (!text) return '';
    
    // Escape HTML
    let html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    
    // Code blocks
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, function(match, lang, code) {
      return `<pre><code class="language-${lang}">${code.trim()}</code></pre>`;
    });
    
    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    
    // Bold
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    
    // Italic
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    
    // Line breaks
    html = html.replace(/\n/g, '<br>');
    
    // Paragraphs (wrap text between double line breaks)
    html = html.replace(/<br><br>/g, '</p><p>');
    html = `<p>${html}</p>`;
    
    return html;
  }

  // Utilities
  function formatTime(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function scrollToBottom() {
    const container = document.querySelector('.messages-container');
    container.scrollTop = container.scrollHeight;
  }

  // Initialize
  connect();
})();
