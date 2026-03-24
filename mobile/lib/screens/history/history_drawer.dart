import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../models/conversation_model.dart';
import '../../providers/auth_provider.dart';
import '../../providers/chat_provider.dart';
import '../../providers/home_screen_controller.dart';
import '../../services/conversation_service.dart';
import '../../theme/app_theme.dart';
import '../../widgets/paper_background.dart';

class HistoryDrawer extends StatefulWidget {
  const HistoryDrawer({super.key});
  @override
  State<HistoryDrawer> createState() => _HistoryDrawerState();
}

class _HistoryDrawerState extends State<HistoryDrawer> {
  List<ConversationModel> _conversations = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final auth = context.read<AuthProvider>();
    if (!auth.isAuthenticated) {
      setState(() => _loading = false);
      return;
    }
    try {
      final service = ConversationService();
      final convs = await service.fetchConversations();
      if (mounted) {
        setState(() {
          _conversations = convs;
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _openConversation(ConversationModel conv) {
    Navigator.pop(context); // close drawer
    context.read<ChatProvider>().loadConversation(conv.id);
    context.read<HomeScreenController>().goToChat();
  }

  Future<void> _deleteConversation(String id) async {
    try {
      await ConversationService().deleteConversation(id);
      setState(() => _conversations.removeWhere((c) => c.id == id));
    } catch (_) {}
  }

  void _confirmDelete(String id, String title) {
    showModalBottomSheet(
      context: context,
      backgroundColor: AppColors.bgPaper,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(12)),
      ),
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 16, 24, 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: AppColors.borderStitch,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const SizedBox(height: 20),
              const Icon(Icons.delete_outline,
                  size: 32, color: AppColors.danger),
              const SizedBox(height: 12),
              const Text(
                'Delete conversation?',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: AppColors.textInk,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                '"$title"',
                style: const TextStyle(
                  fontSize: 13,
                  color: AppColors.textPencil,
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 20),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => Navigator.pop(ctx),
                      style: OutlinedButton.styleFrom(
                        side: const BorderSide(
                            color: AppColors.borderStitch),
                        foregroundColor: AppColors.textGraphite,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(8),
                        ),
                      ),
                      child: const Text('Cancel'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: ElevatedButton(
                      onPressed: () {
                        Navigator.pop(ctx);
                        _deleteConversation(id);
                      },
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.danger,
                        foregroundColor: Colors.white,
                        elevation: 0,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(8),
                        ),
                      ),
                      child: const Text(
                        'DELETE',
                        style: TextStyle(
                          fontWeight: FontWeight.w700,
                          letterSpacing: 0.8,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _newConversation() {
    Navigator.pop(context);
    context.read<ChatProvider>().startNewConversation();
    context.read<HomeScreenController>().goToChat();
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();

    // Compute initials
    String initials = 'G';
    String displayName = 'Guest';
    if (auth.isAuthenticated) {
      displayName = auth.userName;
      final parts = displayName.trim().split(' ');
      if (parts.length >= 2) {
        initials = '${parts[0][0]}${parts[1][0]}'.toUpperCase();
      } else if (displayName.isNotEmpty) {
        initials = displayName[0].toUpperCase();
      }
    }

    return Drawer(
      width: MediaQuery.of(context).size.width * 0.75,
      child: PaperBackground(
        child: Column(
          children: [
            // Header
            Container(
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Color(0xFFE8E3DC),
                    Color(0xFFD4CFC7),
                    Color(0xFFC4BEB5),
                  ],
                ),
                border: Border(
                    bottom:
                        BorderSide(color: AppColors.borderStitch)),
              ),
              child: SafeArea(
                bottom: false,
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 16.0, vertical: 14.0),
                  child: Row(
                    children: [
                      const Icon(Icons.view_sidebar,
                          size: 20, color: AppColors.textGraphite),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment:
                              CrossAxisAlignment.start,
                          children: [
                            const Text(
                              "HISTORY",
                              style: TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w700,
                                color: AppColors.textInk,
                                letterSpacing: 2.0,
                              ),
                            ),
                            Text(
                              "${_conversations.length} conversations",
                              style: const TextStyle(
                                fontSize: 9,
                                color: AppColors.textFaint,
                              ),
                            ),
                          ],
                        ),
                      ),
                      GestureDetector(
                        onTap: _newConversation,
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 10, vertical: 6),
                          decoration: BoxDecoration(
                            color: AppColors.brass.withOpacity(0.1),
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(
                                color:
                                    AppColors.brass.withOpacity(0.3)),
                          ),
                          child: const Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(Icons.add,
                                  size: 16,
                                  color: AppColors.brass),
                              SizedBox(width: 4),
                              Text(
                                'NEW',
                                style: TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w700,
                                  color: AppColors.brass,
                                  letterSpacing: 0.5,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),

            // Body
            Expanded(
              child: _buildBody(auth),
            ),

            // Footer
            Container(
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Color(0xFFE8E3DC),
                    Color(0xFFD4CFC7),
                    Color(0xFFC4BEB5),
                  ],
                ),
                border: Border(
                    top: BorderSide(color: AppColors.borderStitch)),
              ),
              child: SafeArea(
                top: false,
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 16.0, vertical: 16.0),
                  child: Row(
                    children: [
                      CircleAvatar(
                        radius: 18,
                        backgroundColor: auth.isAuthenticated
                            ? AppColors.brass
                            : AppColors.textGraphite,
                        child: Text(
                          initials,
                          style: const TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                            color: Colors.white,
                          ),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Column(
                        crossAxisAlignment:
                            CrossAxisAlignment.start,
                        children: [
                          Text(
                            displayName,
                            style: const TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              color: AppColors.textInk,
                            ),
                          ),
                          Text(
                            "${_conversations.length} saved conversations",
                            style: const TextStyle(
                              fontSize: 10,
                              color: AppColors.textFaint,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildBody(AuthProvider auth) {
    if (_loading) {
      return const Center(
        child: CircularProgressIndicator(
          strokeWidth: 2,
          valueColor: AlwaysStoppedAnimation(AppColors.brass),
        ),
      );
    }

    if (!auth.isAuthenticated) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                Icons.lock_outline,
                size: 48,
                color: AppColors.textFaint.withOpacity(0.4),
              ),
              const SizedBox(height: 16),
              const Text(
                'Sign in to view history',
                style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w600,
                  color: AppColors.textInk,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 8),
              const Text(
                'Your saved conversations\nwill appear here.',
                style: TextStyle(
                  fontSize: 12,
                  color: AppColors.textPencil,
                  height: 1.6,
                ),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      );
    }

    if (_conversations.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                Icons.history_edu_outlined,
                size: 48,
                color: AppColors.textFaint.withOpacity(0.4),
              ),
              const SizedBox(height: 16),
              const Text(
                'No saved conversations',
                style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w600,
                  color: AppColors.textInk,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 8),
              const Text(
                'Tap the bookmark icon after\na chat to save it here.',
                style: TextStyle(
                  fontSize: 12,
                  color: AppColors.textPencil,
                  height: 1.6,
                ),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      );
    }

    // Group conversations by time period
    final chat = context.watch<ChatProvider>();
    String? lastGroup;
    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      itemCount: _conversations.length,
      itemBuilder: (_, i) {
        final conv = _conversations[i];
        final group = conv.groupLabel;
        final showHeader = group != lastGroup;
        lastGroup = group;
        final isActive = chat.activeConversationId == conv.id;

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (showHeader)
              Padding(
                padding: const EdgeInsets.fromLTRB(4, 12, 0, 6),
                child: Text(
                  group.toUpperCase(),
                  style: const TextStyle(
                    fontSize: 8,
                    fontWeight: FontWeight.w600,
                    color: AppColors.textFaint,
                    letterSpacing: 1.2,
                  ),
                ),
              ),
            Dismissible(
              key: Key(conv.id),
              direction: DismissDirection.endToStart,
              background: Container(
                alignment: Alignment.centerRight,
                padding: const EdgeInsets.only(right: 16),
                decoration: BoxDecoration(
                  color: AppColors.danger.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Icon(Icons.delete_outline,
                    color: AppColors.danger, size: 18),
              ),
              confirmDismiss: (_) async {
                _confirmDelete(conv.id, conv.title);
                return false;
              },
              child: InkWell(
                onTap: () => _openConversation(conv),
                borderRadius: BorderRadius.circular(8),
                child: Container(
                  width: double.infinity,
                  margin: const EdgeInsets.only(bottom: 6),
                  padding: const EdgeInsets.symmetric(
                      horizontal: 12, vertical: 12),
                  decoration: BoxDecoration(
                    color: AppColors.bgPaper,
                    borderRadius: BorderRadius.circular(8),
                    border: isActive
                        ? const Border(
                            left: BorderSide(color: AppColors.brass, width: 3),
                          )
                        : Border.all(
                            color: AppColors.borderStitch.withOpacity(0.3)),
                  ),
                  child: Row(
                    children: [
                      Icon(
                        Icons.chat_bubble_outline,
                        size: 14,
                        color: isActive
                            ? AppColors.brass
                            : AppColors.textPencil,
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment:
                              CrossAxisAlignment.start,
                          children: [
                            Text(
                              conv.title,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                fontSize: 12,
                                fontWeight: isActive
                                    ? FontWeight.w600
                                    : FontWeight.w500,
                                color: AppColors.textInk,
                              ),
                            ),
                            Text(
                              conv.relativeTime,
                              style: const TextStyle(
                                fontSize: 9,
                                color: AppColors.textFaint,
                              ),
                            ),
                          ],
                        ),
                      ),
                      IconButton(
                        icon: const Icon(Icons.delete_outline,
                            size: 16,
                            color: AppColors.textPencil),
                        padding: EdgeInsets.zero,
                        constraints: const BoxConstraints(),
                        onPressed: () =>
                            _confirmDelete(conv.id, conv.title),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}
