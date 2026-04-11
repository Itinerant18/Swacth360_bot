'use client';

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faSpinner, faTrash } from '@fortawesome/free-solid-svg-icons';

export interface ConversationSidebarConversation {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    messageCount: number;
}

type ConversationSidebarProps = {
    isOpen: boolean;
    conversations: ConversationSidebarConversation[];
    activeConversationId: string | null;
    loadingConversationId: string | null;
    userName: string;
    onClose: () => void;
    onNew: () => void;
    onSelect: (conversationId: string) => void;
    onDelete: (conversationId: string) => void;
};

function formatRelativeTime(value: Date | string): string {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';

    const diffMs = Date.now() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
}

function groupConversationsByDate(conversations: ConversationSidebarConversation[]): [string, ConversationSidebarConversation[]][] {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 86400000);
    const thisWeekStart = new Date(today.getTime() - 7 * 86400000);
    const thisMonthStart = new Date(today.getTime() - 30 * 86400000);

    const groups: Record<string, ConversationSidebarConversation[]> = {
        Today: [],
        Yesterday: [],
        'Previous 7 Days': [],
        'Previous 30 Days': [],
        Older: [],
    };

    for (const conversation of conversations) {
        const updatedAt = new Date(conversation.updatedAt);
        if (updatedAt >= today) {
            groups.Today.push(conversation);
        } else if (updatedAt >= yesterday) {
            groups.Yesterday.push(conversation);
        } else if (updatedAt >= thisWeekStart) {
            groups['Previous 7 Days'].push(conversation);
        } else if (updatedAt >= thisMonthStart) {
            groups['Previous 30 Days'].push(conversation);
        } else {
            groups.Older.push(conversation);
        }
    }

    return Object.entries(groups).filter(([, items]) => items.length > 0);
}

export default function ConversationSidebar({
    isOpen,
    conversations,
    activeConversationId,
    loadingConversationId,
    userName,
    onClose,
    onNew,
    onSelect,
    onDelete,
}: ConversationSidebarProps) {
    const groupedConversations = groupConversationsByDate(conversations);

    return (
        <aside className={`fixed lg:relative z-40 lg:z-auto top-0 left-0 h-full bg-[#E8E0D4] border-r border-[#C4BCB0] flex flex-col transition-all duration-300 ease-in-out overflow-hidden flex-shrink-0 shadow-[10px_0_24px_rgba(28,25,23,0.12)] ${isOpen ? 'w-72 translate-x-0' : 'w-0 -translate-x-full lg:translate-x-0 lg:w-0'}`}>
            <div className="w-72 h-full flex flex-col min-w-[18rem]">
                <div className="px-3 border-b border-[#D6CFC4]">
                    <div className="flex items-center justify-between h-16">
                        <div className="flex items-center gap-2">
                            <button onClick={onClose} className="flex items-center justify-center w-10 h-10 rounded-lg text-[#78716C] hover:text-[#1C1917] hover:bg-black/5 transition-colors" title="Close sidebar" aria-label="Close sidebar">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                    <line x1="9" y1="3" x2="9" y2="21" />
                                </svg>
                            </button>
                            <p className="text-xs font-semibold text-[#44403C] uppercase tracking-[0.14em]">History</p>
                        </div>
                        <button onClick={onNew} className="p-1.5 rounded-lg text-[#78716C] hover:text-[#CA8A04] hover:bg-[#CA8A04]/10 transition-colors" title="New conversation" aria-label="New conversation">
                            <FontAwesomeIcon icon={faPlus} className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4 bg-[linear-gradient(180deg,rgba(255,255,255,0.18),rgba(255,255,255,0))]">
                    {conversations.length === 0 ? (
                        <div className="skeuo-card px-4 py-8 text-center">
                            <p className="text-sm font-medium text-[#44403C]">No conversations yet</p>
                            <p className="mt-1 text-xs text-[#78716C]">Your recent chats will appear here.</p>
                        </div>
                    ) : (
                        groupedConversations.map(([groupLabel, items]) => (
                            <div key={groupLabel}>
                                <div className="px-2 pb-2 text-[10px] font-semibold text-[#78716C] uppercase tracking-[0.18em]">
                                    {groupLabel}
                                </div>
                                <div className="space-y-2">
                                    {items.map((conversation) => {
                                        const isActive = activeConversationId === conversation.id;
                                        const isConversationLoading = loadingConversationId === conversation.id;

                                        return (
                                            <div
                                                key={conversation.id}
                                                role="button"
                                                tabIndex={0}
                                                className={`group relative rounded-2xl border px-3 py-3 cursor-pointer transition-all ${isActive
                                                    ? 'bg-[#F7F2EA] border-[#CA8A04]/40 shadow-[0_0_0_1px_rgba(202,138,4,0.08),0_6px_16px_rgba(28,25,23,0.08)]'
                                                    : 'bg-[#FAF7F2] border-[#D6CFC4] shadow-[0_1px_0_rgba(255,255,255,0.65)_inset,0_3px_10px_rgba(28,25,23,0.05)] hover:border-[#C4BCB0] hover:-translate-y-[1px]'
                                                }`}
                                                onClick={() => onSelect(conversation.id)}
                                                onKeyDown={(event) => {
                                                    if (event.key === 'Enter' || event.key === ' ') {
                                                        event.preventDefault();
                                                        onSelect(conversation.id);
                                                    }
                                                }}
                                            >
                                                {isActive && (
                                                    <span className="absolute left-0 top-3 bottom-3 w-1 rounded-r-full bg-[#CA8A04]" />
                                                )}
                                                <div className="pr-7">
                                                    <div className="truncate text-[13px] font-medium leading-5 text-[#1C1917]">
                                                        {conversation.title}
                                                    </div>
                                                    <div className="mt-1 flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-[#78716C]">
                                                        <span>{formatRelativeTime(conversation.updatedAt)}</span>
                                                        <span className="h-1 w-1 rounded-full bg-[#C4BCB0]" />
                                                        <span>{conversation.messageCount} msgs</span>
                                                    </div>
                                                </div>

                                                <div className="absolute right-2 top-2 flex items-center gap-1">
                                                    {isConversationLoading && (
                                                        <FontAwesomeIcon icon={faSpinner} className="w-3 h-3 animate-spin text-[#78716C]" />
                                                    )}
                                                    <button
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            onDelete(conversation.id);
                                                        }}
                                                        className={`rounded-md p-1 text-[#A8A29E] hover:text-red-600 hover:bg-red-50 transition-all ${isActive || isConversationLoading ? 'opacity-0 pointer-events-none' : 'opacity-0 group-hover:opacity-100'}`}
                                                        title="Delete"
                                                        aria-label="Delete"
                                                    >
                                                        <FontAwesomeIcon icon={faTrash} className="w-3 h-3" />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))
                    )}
                </div>

                <div className="border-t border-[#D6CFC4] p-3 bg-[#E1D8CB]">
                    <div className="skeuo-card flex items-center gap-3 px-3 py-2.5">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#4B2E22] text-sm font-semibold text-[#FAF7F2] shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_2px_6px_rgba(28,25,23,0.2)]">
                            {userName.slice(0, 1).toUpperCase() || 'U'}
                        </div>
                        <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-[#1C1917]">{userName}</div>
                            <div className="text-[11px] text-[#78716C]">
                                {conversations.length} saved conversation{conversations.length !== 1 ? 's' : ''}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </aside>
    );
}
