/**
 * Message Tree Utility
 * Builds a tree structure from flat messages using parent_message_id,
 * resolves the active display path, and provides sibling navigation info.
 *
 * Backward compatible: messages without parent_message_id are treated as a
 * linear chain ordered by created_at.
 */

export interface FlatMessage {
  id: string;
  parent_message_id?: string | null;
  active_child_id?: string | null;
  created_at: string;
  role: string;
}

export interface MessageNode {
  id: string;
  parentMessageId: string | null;
  activeChildId: string | null;
  children: string[];
  siblingIndex: number;
  siblingCount: number;
  createdAt: string;
}

export interface MessageTree {
  nodes: Map<string, MessageNode>;
  rootIds: string[];
  activePath: string[];
}

/**
 * Build a message tree from a flat list of messages.
 * If no message has parent_message_id, infers a linear chain from created_at order.
 */
export function buildMessageTree(messages: FlatMessage[]): MessageTree {
  if (!messages.length) {
    return { nodes: new Map(), rootIds: [], activePath: [] };
  }

  // Check if any message uses the tree structure
  const hasTreeData = messages.some((m) => m.parent_message_id);

  if (!hasTreeData) {
    return buildLinearTree(messages);
  }

  return buildBranchingTree(messages);
}

/**
 * Fallback: build a linear "tree" where each message is the parent of the next.
 * This preserves backward compatibility for pre-branching chats.
 */
function buildLinearTree(messages: FlatMessage[]): MessageTree {
  const sorted = [...messages].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  const nodes = new Map<string, MessageNode>();
  const rootIds: string[] = [];
  const activePath: string[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const msg = sorted[i];
    const parentId = i > 0 ? sorted[i - 1].id : null;

    nodes.set(msg.id, {
      id: msg.id,
      parentMessageId: parentId,
      activeChildId: i < sorted.length - 1 ? sorted[i + 1].id : null,
      children: i < sorted.length - 1 ? [sorted[i + 1].id] : [],
      siblingIndex: 0,
      siblingCount: 1,
      createdAt: msg.created_at,
    });

    activePath.push(msg.id);
  }

  if (sorted.length > 0) {
    rootIds.push(sorted[0].id);
  }

  return { nodes, rootIds, activePath };
}

/**
 * Build a proper branching tree from messages with parent_message_id.
 */
function buildBranchingTree(messages: FlatMessage[]): MessageTree {
  const nodes = new Map<string, MessageNode>();
  const childrenMap = new Map<string, string[]>(); // parentId -> childIds
  const rootIds: string[] = [];

  // First pass: create nodes and collect parent-child relationships
  for (const msg of messages) {
    nodes.set(msg.id, {
      id: msg.id,
      parentMessageId: msg.parent_message_id || null,
      activeChildId: msg.active_child_id || null,
      children: [],
      siblingIndex: 0,
      siblingCount: 1,
      createdAt: msg.created_at,
    });

    if (!msg.parent_message_id) {
      rootIds.push(msg.id);
    } else {
      const siblings = childrenMap.get(msg.parent_message_id) || [];
      siblings.push(msg.id);
      childrenMap.set(msg.parent_message_id, siblings);
    }
  }

  // Second pass: assign children and compute sibling info
  for (const [parentId, childIds] of childrenMap) {
    // Sort children by created_at for consistent ordering
    childIds.sort((a, b) => {
      const nodeA = nodes.get(a);
      const nodeB = nodes.get(b);
      if (!nodeA || !nodeB) return 0;
      return new Date(nodeA.createdAt).getTime() - new Date(nodeB.createdAt).getTime();
    });

    const parentNode = nodes.get(parentId);
    if (parentNode) {
      parentNode.children = childIds;
    }

    // Set sibling info on each child
    for (let i = 0; i < childIds.length; i++) {
      const childNode = nodes.get(childIds[i]);
      if (childNode) {
        childNode.siblingIndex = i;
        childNode.siblingCount = childIds.length;
      }
    }
  }

  // Sort root IDs by created_at
  rootIds.sort((a, b) => {
    const nodeA = nodes.get(a);
    const nodeB = nodes.get(b);
    if (!nodeA || !nodeB) return 0;
    return new Date(nodeA.createdAt).getTime() - new Date(nodeB.createdAt).getTime();
  });

  // Set sibling info for roots
  for (let i = 0; i < rootIds.length; i++) {
    const rootNode = nodes.get(rootIds[i]);
    if (rootNode) {
      rootNode.siblingIndex = i;
      rootNode.siblingCount = rootIds.length;
    }
  }

  // Resolve active path
  const activePath = resolveActivePath({ nodes, rootIds, activePath: [] });

  return { nodes, rootIds, activePath };
}

/**
 * Resolve the active display path through the tree.
 * Starts from the first root, follows active_child_id at each branch point.
 * Falls back to the most recently created child when active_child_id is not set.
 */
export function resolveActivePath(tree: MessageTree): string[] {
  const path: string[] = [];
  const { nodes, rootIds } = tree;

  if (rootIds.length === 0) return path;

  // Start from the first root (or active root if we add that concept later)
  let currentId: string | null = rootIds[0];

  while (currentId) {
    const node = nodes.get(currentId);
    if (!node) break;

    path.push(currentId);

    if (node.children.length === 0) {
      break;
    }

    // Follow active_child_id if set and valid
    if (node.activeChildId && nodes.has(node.activeChildId)) {
      currentId = node.activeChildId;
    } else {
      // Default to the last child (most recently created)
      currentId = node.children[node.children.length - 1];
    }
  }

  return path;
}

/**
 * Get sibling information for a message in the tree.
 * Returns the list of sibling IDs and the current message's index among them.
 */
export function getSiblingInfo(
  tree: MessageTree,
  messageId: string
): { siblings: string[]; currentIndex: number } {
  const node = tree.nodes.get(messageId);
  if (!node) return { siblings: [messageId], currentIndex: 0 };

  if (!node.parentMessageId) {
    // It's a root node — siblings are other roots
    return {
      siblings: tree.rootIds,
      currentIndex: tree.rootIds.indexOf(messageId),
    };
  }

  const parentNode = tree.nodes.get(node.parentMessageId);
  if (!parentNode) return { siblings: [messageId], currentIndex: 0 };

  return {
    siblings: parentNode.children,
    currentIndex: parentNode.children.indexOf(messageId),
  };
}
