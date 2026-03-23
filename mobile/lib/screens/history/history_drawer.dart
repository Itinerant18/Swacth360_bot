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
      width: MediaQuery.of(context).size.width * 0.78,
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
                border:
                    Border(bottom: BorderSide(color: AppColors.borderStitch)),
              ),
              child: SafeArea(
                bottom: false,
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 16.0, vertical: 12.0),
                  child: Row(
                    children: [
                      const Icon(Icons.view_sidebar,
                          size: 18, color: AppColors.textGraphite),
                      const SizedBox(width: 8),
                      const Text(
                        "HISTORY",
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: AppColors.textInk,
                          letterSpacing: 1.5,
                        ),
                      ),
                      const Spacer(),
                      IconButton(
                        icon: const Icon(Icons.add,
                            size: 20, color: AppColors.brass),
                        padding: EdgeInsets.zero,
                        constraints: const BoxConstraints(),
                        onPressed: _newConversation,
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
                border:
                    Border(top: BorderSide(color: AppColors.borderStitch)),
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
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            displayName,
                            style: const TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                              color: AppColors.textInk,
                            ),
                          ),
                          Text(
                            "${_conversations.length} saved conversations",
                            style: const TextStyle(
                              fontSize: 11,
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
        child: Container(
          margin: const EdgeInsets.all(16),
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            color: AppColors.bgPaper,
            borderRadius: BorderRadius.circular(4),
            border: Border.all(color: AppColors.borderStitch),
            boxShadow: AppShadows.card,
          ),
          child: const Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                "Sign in to view history",
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: AppColors.textInk,
                ),
                textAlign: TextAlign.center,
              ),
              SizedBox(height: 4),
              Text(
                "Your recent chats will appear here.",
                style: TextStyle(
                  fontSize: 12,
                  color: AppColors.textPencil,
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
        child: Container(
          margin: const EdgeInsets.all(16),
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            color: AppColors.bgPaper,
            borderRadius: BorderRadius.circular(4),
            border: Border.all(color: AppColors.borderStitch),
            boxShadow: AppShadows.card,
          ),
          child: const Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                "No conversations yet",
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: AppColors.textInk,
                ),
                textAlign: TextAlign.center,
              ),
              SizedBox(height: 4),
              Text(
                "Your recent chats will appear here.",
                style: TextStyle(
                  fontSize: 12,
                  color: AppColors.textPencil,
                ),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      );
    }

    // Group conversations by time period
    String? lastGroup;
    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      itemCount: _conversations.length,
      itemBuilder: (_, i) {
        final conv = _conversations[i];
        final group = conv.groupLabel;
        final showHeader = group != lastGroup;
        lastGroup = group;

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (showHeader)
              Padding(
                padding: const EdgeInsets.fromLTRB(4, 12, 0, 6),
                child: Text(
                  group.toUpperCase(),
                  style: const TextStyle(
                    fontSize: 9,
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
                color: AppColors.danger.withOpacity(0.1),
                child: const Icon(Icons.delete_outline,
                    color: AppColors.danger, size: 18),
              ),
              onDismissed: (_) => _deleteConversation(conv.id),
              child: GestureDetector(
                onTap: () => _openConversation(conv),
                child: Container(
                  width: double.infinity,
                  margin: const EdgeInsets.only(bottom: 4),
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  decoration: BoxDecoration(
                    color: AppColors.bgPaper,
                    borderRadius: BorderRadius.circular(4),
                    border: Border.all(
                        color: AppColors.borderStitch.withOpacity(0.5)),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.chat_bubble_outline,
                          size: 14, color: AppColors.textPencil),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              conv.title,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w500,
                                color: AppColors.textInk,
                              ),
                            ),
                            Text(
                              conv.relativeTime,
                              style: const TextStyle(
                                fontSize: 10,
                                color: AppColors.textFaint,
                              ),
                            ),
                          ],
                        ),
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
