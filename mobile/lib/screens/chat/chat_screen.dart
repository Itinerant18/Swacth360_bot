import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../providers/auth_provider.dart';
import '../../providers/chat_provider.dart';
import '../../providers/guest_provider.dart';
import '../../providers/language_provider.dart';
import '../../theme/app_theme.dart';
import '../../widgets/chat_input_bar.dart';
import '../../widgets/error_banner.dart';
import '../../widgets/message_bubble.dart';
import '../auth/login_screen.dart';

class ChatScreen extends StatefulWidget {
  const ChatScreen({super.key});

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final _scrollCtrl = ScrollController();

  @override
  void dispose() {
    _scrollCtrl.dispose();
    super.dispose();
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollCtrl.hasClients) {
        _scrollCtrl.animateTo(
          _scrollCtrl.position.maxScrollExtent,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }

  Future<void> _send(String text) async {
    final auth = context.read<AuthProvider>();
    final guest = context.read<GuestProvider>();
    final lang = context.read<LanguageProvider>().code;

    // Guest limit check
    if (!auth.isAuthenticated && guest.limitReached) {
      _showGuestLimitSheet();
      return;
    }

    await context.read<ChatProvider>().sendMessage(
      text,
      language: lang,
      userId: auth.user?.id,
      accessToken: auth.accessToken,
    );

    // Increment guest counter after successful send
    if (!auth.isAuthenticated) {
      guest.increment();
    }

    _scrollToBottom();
  }

  void _showGuestLimitSheet() {
    showModalBottomSheet(
      context: context,
      backgroundColor: AppColors.bgPaper,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 24, 20, 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: AppColors.borderHover,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(height: 20),
            const Icon(Icons.lock_outline_rounded,
                size: 40, color: AppColors.brass),
            const SizedBox(height: 12),
            const Text(
              'Free limit reached',
              style: TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.w700,
                color: AppColors.textInk,
              ),
            ),
            const SizedBox(height: 6),
            const Text(
              "You've used all 3 free questions. Sign in to continue.",
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 13, color: AppColors.textPencil),
            ),
            const SizedBox(height: 24),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => Navigator.pop(context),
                    style: OutlinedButton.styleFrom(
                      minimumSize: const Size.fromHeight(44),
                      side: const BorderSide(color: AppColors.borderStitch),
                    ),
                    child: const Text(
                      'Cancel',
                      style: TextStyle(color: AppColors.textGraphite),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: ElevatedButton(
                    onPressed: () {
                      Navigator.pop(context);
                      Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) => const LoginScreen(),
                        ),
                      );
                    },
                    style: ElevatedButton.styleFrom(
                      minimumSize: const Size.fromHeight(44),
                    ),
                    child: const Text('SIGN IN'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  void _showSaveDialog() {
    final chat = context.read<ChatProvider>();
    final firstUserMsg = chat.messages
        .where((m) => m.role.name == 'user')
        .map((m) => m.content)
        .firstOrNull;
    final titleCtrl = TextEditingController(
      text: firstUserMsg != null && firstUserMsg.length > 80
          ? firstUserMsg.substring(0, 80)
          : firstUserMsg ?? '',
    );

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.bgPaper,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: const Text(
          'Save conversation',
          style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
        ),
        content: TextField(
          controller: titleCtrl,
          decoration: const InputDecoration(hintText: 'Conversation title'),
          maxLines: 2,
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text(
              'Cancel',
              style: TextStyle(color: AppColors.textPencil),
            ),
          ),
          ElevatedButton(
            onPressed: () async {
              Navigator.pop(ctx);
              try {
                await chat.saveSession(titleCtrl.text.trim());
                if (mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Conversation saved')),
                  );
                }
              } catch (e) {
                if (mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('Save failed: $e')),
                  );
                }
              }
            },
            child: const Text('Save'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bgDesk,
      appBar: _ChatAppBar(onSave: _showSaveDialog),
      body: Column(
        children: [
          // Error banner
          Consumer<ChatProvider>(
            builder: (_, chat, __) {
              if (chat.error == null) return const SizedBox.shrink();
              return ErrorBanner(
                message: chat.error!,
                onDismiss: chat.clearError,
              );
            },
          ),
          Expanded(child: _MessageList(scrollCtrl: _scrollCtrl)),
          Consumer<ChatProvider>(
            builder: (_, chat, __) => ChatInputBar(
              isLoading: chat.isLoading,
              onSend: _send,
            ),
          ),
        ],
      ),
    );
  }
}

// -- App bar --

class _ChatAppBar extends StatelessWidget implements PreferredSizeWidget {
  final VoidCallback onSave;
  const _ChatAppBar({required this.onSave});

  @override
  Size get preferredSize => const Size.fromHeight(56);

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();

    return Consumer<ChatProvider>(
      builder: (_, chat, __) => AppBar(
        title: Row(
          children: [
            Container(
              width: 28,
              height: 28,
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [AppColors.brassGlow, AppColors.brass],
                ),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Center(
                child: Text(
                  'S',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 12,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ),
            const SizedBox(width: 10),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'SAI',
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700),
                ),
                Text(
                  chat.activeConversationId != null
                      ? 'Conversation active'
                      : 'Panel Support Bot',
                  style: const TextStyle(
                    fontSize: 10,
                    color: AppColors.textPencil,
                    fontWeight: FontWeight.w400,
                  ),
                ),
              ],
            ),
          ],
        ),
        actions: [
          // Save button
          if (auth.isAuthenticated && chat.hasMessages && !chat.sessionSaved)
            IconButton(
              icon: const Icon(Icons.bookmark_outline_rounded,
                  size: 20, color: AppColors.brass),
              onPressed: onSave,
              tooltip: 'Save conversation',
            ),
          // New chat button
          if (chat.hasMessages)
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: TextButton.icon(
                icon: const Icon(Icons.add_circle_outline_rounded,
                    size: 15, color: AppColors.brass),
                label: const Text(
                  'New',
                  style: TextStyle(
                    fontSize: 12,
                    color: AppColors.brass,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                onPressed: chat.startNewConversation,
              ),
            ),
        ],
      ),
    );
  }
}

// -- Message list --

class _MessageList extends StatelessWidget {
  final ScrollController scrollCtrl;
  const _MessageList({required this.scrollCtrl});

  @override
  Widget build(BuildContext context) {
    return Consumer<ChatProvider>(
      builder: (_, chat, __) {
        if (!chat.hasMessages) return const _WelcomeState();

        return ListView.builder(
          controller: scrollCtrl,
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
          itemCount: chat.messages.length + (chat.isLoading ? 1 : 0),
          itemBuilder: (_, i) {
            if (i == chat.messages.length) return const TypingIndicator();
            return MessageBubble(message: chat.messages[i]);
          },
        );
      },
    );
  }
}

// -- Welcome / empty state --

class _WelcomeState extends StatelessWidget {
  const _WelcomeState();

  @override
  Widget build(BuildContext context) {
    final langProvider = context.watch<LanguageProvider>();
    final strings = langProvider.strings;

    return CustomScrollView(
      slivers: [
        SliverFillRemaining(
          hasScrollBody: false,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Container(
                  width: 64,
                  height: 64,
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(
                      colors: [AppColors.brassGlow, AppColors.brass],
                    ),
                    borderRadius: BorderRadius.circular(18),
                    boxShadow: [
                      BoxShadow(
                        color: AppColors.brass.withOpacity(0.25),
                        blurRadius: 20,
                        offset: const Offset(0, 8),
                      ),
                    ],
                  ),
                  child: const Center(
                    child: Text(
                      'S',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 22,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 18),
                Text(
                  strings.welcomeTitle,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w700,
                    color: AppColors.textInk,
                    height: 1.3,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  strings.welcomeSubtitle,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    fontSize: 13,
                    color: AppColors.textPencil,
                    height: 1.5,
                  ),
                ),
                const SizedBox(height: 28),
                Wrap(
                  alignment: WrapAlignment.center,
                  spacing: 8,
                  runSpacing: 8,
                  children: strings.quickPrompts
                      .map((p) => _PromptChip(text: p))
                      .toList(),
                ),
                const SizedBox(height: 36),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _PromptChip extends StatelessWidget {
  final String text;
  const _PromptChip({required this.text});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () {
        final auth = context.read<AuthProvider>();
        final lang = context.read<LanguageProvider>().code;
        context.read<ChatProvider>().sendMessage(
              text,
              language: lang,
              userId: auth.user?.id,
              accessToken: auth.accessToken,
            );
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: AppColors.bgPaper,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: AppColors.borderStitch),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.03),
              blurRadius: 4,
              offset: const Offset(0, 1),
            ),
          ],
        ),
        child: Text(
          text,
          style: const TextStyle(
            fontSize: 12,
            color: AppColors.textGraphite,
            fontWeight: FontWeight.w500,
          ),
        ),
      ),
    );
  }
}
