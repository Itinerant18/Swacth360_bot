import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../models/conversation_model.dart';
import '../../providers/auth_provider.dart';
import '../../providers/chat_provider.dart';
import '../../providers/home_screen_controller.dart';
import '../../services/conversation_service.dart';
import '../../theme/app_theme.dart';
import '../auth/login_screen.dart';

class HistoryScreen extends StatefulWidget {
  const HistoryScreen({super.key});

  @override
  State<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends State<HistoryScreen> {
  final _service = ConversationService();
  List<ConversationModel> _conversations = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    _conversations = await _service.fetchConversations();
    if (mounted) setState(() => _loading = false);
  }

  void _open(ConversationModel c) {
    final chatProvider = context.read<ChatProvider>();
    chatProvider.loadConversation(c.id);
    context.read<HomeScreenController>().goToChat();
  }

  Future<void> _delete(ConversationModel c) async {
    await _service.deleteConversation(c.id);
    setState(() => _conversations.removeWhere((x) => x.id == c.id));
  }

  @override
  Widget build(BuildContext context) {
    final isAuth = context.watch<AuthProvider>().isAuthenticated;

    return Scaffold(
      backgroundColor: AppColors.bgDesk,
      appBar: AppBar(
        title: const Text('History'),
        actions: [
          if (_conversations.isNotEmpty)
            IconButton(
              icon: const Icon(Icons.refresh_rounded, size: 20),
              onPressed: _load,
            ),
        ],
      ),
      body: !isAuth
          ? _SignInPrompt()
          : _loading
              ? const Center(
                  child: CircularProgressIndicator(
                    valueColor: AlwaysStoppedAnimation(AppColors.brass),
                  ),
                )
              : _conversations.isEmpty
                  ? _EmptyState(onRefresh: _load)
                  : _ConversationList(
                      conversations: _conversations,
                      onTap: _open,
                      onDelete: _delete,
                      onRefresh: _load,
                    ),
    );
  }
}

class _ConversationList extends StatelessWidget {
  final List<ConversationModel> conversations;
  final void Function(ConversationModel) onTap;
  final void Function(ConversationModel) onDelete;
  final Future<void> Function() onRefresh;

  const _ConversationList({
    required this.conversations,
    required this.onTap,
    required this.onDelete,
    required this.onRefresh,
  });

  @override
  Widget build(BuildContext context) {
    final groups = <String, List<ConversationModel>>{};
    for (final c in conversations) {
      groups.putIfAbsent(c.groupLabel, () => []).add(c);
    }
    final order = [
      'Today',
      'Yesterday',
      'Previous 7 Days',
      'Previous 30 Days',
      'Older',
    ];
    final sortedGroups = order.where(groups.containsKey).toList();

    // Build flat list of items
    final items = <_ListItem>[];
    for (final group in sortedGroups) {
      items.add(_ListItem.header(group));
      for (final c in groups[group]!) {
        items.add(_ListItem.conversation(c));
      }
    }

    return RefreshIndicator(
      color: AppColors.brass,
      onRefresh: onRefresh,
      child: ListView.builder(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
        itemCount: items.length,
        itemBuilder: (_, i) {
          final item = items[i];
          if (item.isHeader) return _GroupHeader(item.headerLabel!);
          return _ConvTile(
            conv: item.conv!,
            onTap: () => onTap(item.conv!),
            onDelete: () => onDelete(item.conv!),
          );
        },
      ),
    );
  }
}

class _ListItem {
  final String? headerLabel;
  final ConversationModel? conv;
  bool get isHeader => headerLabel != null;

  _ListItem.header(this.headerLabel) : conv = null;
  _ListItem.conversation(this.conv) : headerLabel = null;
}

class _GroupHeader extends StatelessWidget {
  final String label;
  const _GroupHeader(this.label);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 8, 0, 8),
      child: Text(
        label.toUpperCase(),
        style: const TextStyle(
          fontSize: 10,
          fontWeight: FontWeight.w700,
          color: AppColors.textFaint,
          letterSpacing: 1.5,
        ),
      ),
    );
  }
}

class _ConvTile extends StatelessWidget {
  final ConversationModel conv;
  final VoidCallback onTap, onDelete;

  const _ConvTile({
    required this.conv,
    required this.onTap,
    required this.onDelete,
  });

  @override
  Widget build(BuildContext context) {
    return Dismissible(
      key: Key(conv.id),
      direction: DismissDirection.endToStart,
      background: Container(
        alignment: Alignment.centerRight,
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.only(right: 16),
        decoration: BoxDecoration(
          color: AppColors.error.withOpacity(0.12),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.error.withOpacity(0.3)),
        ),
        child: const Icon(Icons.delete_outline_rounded,
            color: AppColors.error, size: 20),
      ),
      onDismissed: (_) => onDelete(),
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          margin: const EdgeInsets.only(bottom: 8),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            color: AppColors.bgPaper,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppColors.borderStitch),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withOpacity(0.03),
                blurRadius: 4,
                offset: const Offset(0, 1),
              ),
            ],
          ),
          child: Row(
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: AppColors.brass.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Icon(Icons.chat_bubble_outline_rounded,
                    size: 16, color: AppColors.brass),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      conv.title,
                      style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: AppColors.textInk,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 2),
                    Row(
                      children: [
                        Text(
                          '${conv.messageCount} messages',
                          style: const TextStyle(
                              fontSize: 11, color: AppColors.textFaint),
                        ),
                        const SizedBox(width: 6),
                        Container(
                          width: 2,
                          height: 2,
                          decoration: const BoxDecoration(
                            color: AppColors.textFaint,
                            shape: BoxShape.circle,
                          ),
                        ),
                        const SizedBox(width: 6),
                        Text(
                          conv.relativeTime,
                          style: const TextStyle(
                              fontSize: 11, color: AppColors.textFaint),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right_rounded,
                  size: 18, color: AppColors.textFaint),
            ],
          ),
        ),
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  final VoidCallback onRefresh;
  const _EmptyState({required this.onRefresh});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.history_rounded,
              size: 52, color: AppColors.textFaint.withOpacity(0.5)),
          const SizedBox(height: 14),
          const Text(
            'No saved conversations',
            style: TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w600,
              color: AppColors.textPencil,
            ),
          ),
          const SizedBox(height: 6),
          const Text(
            'Start a chat to build your history',
            style: TextStyle(fontSize: 12, color: AppColors.textFaint),
          ),
          const SizedBox(height: 18),
          OutlinedButton.icon(
            icon: const Icon(Icons.refresh_rounded, size: 15),
            label: const Text('Refresh'),
            style: OutlinedButton.styleFrom(
              foregroundColor: AppColors.brass,
              side: const BorderSide(color: AppColors.brass),
            ),
            onPressed: onRefresh,
          ),
        ],
      ),
    );
  }
}

class _SignInPrompt extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.lock_outline_rounded,
                size: 52, color: AppColors.textFaint.withOpacity(0.5)),
            const SizedBox(height: 16),
            const Text(
              'Sign in to view history',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w600,
                color: AppColors.textInk,
              ),
            ),
            const SizedBox(height: 8),
            const Text(
              'Your conversations are saved to your account.',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 13, color: AppColors.textPencil),
            ),
            const SizedBox(height: 20),
            ElevatedButton(
              onPressed: () => Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const LoginScreen()),
              ),
              child: const Text('SIGN IN'),
            ),
          ],
        ),
      ),
    );
  }
}
