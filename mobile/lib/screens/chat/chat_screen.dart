import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/auth_provider.dart';
import '../../providers/chat_provider.dart';
import '../../providers/guest_provider.dart';
import '../../providers/language_provider.dart';
import '../../theme/app_theme.dart';
import '../../widgets/top_nav_bar.dart';
import '../../widgets/paper_background.dart';
import '../../widgets/chat_input_bar.dart';
import '../../widgets/message_bubble.dart';
import '../../models/message_model.dart';
import '../../widgets/save_session_sheet.dart';
import '../profile/profile_modal.dart';
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

  Future<void> _sendMessage(String text) async {
    if (text.trim().isEmpty) return;

    final auth = context.read<AuthProvider>();
    final guest = context.read<GuestProvider>();
    final lang = context.read<LanguageProvider>().code;
    final chat = context.read<ChatProvider>();

    // Guest limit check
    if (!auth.isAuthenticated) {
      if (guest.limitReached) {
        _showGuestLimitModal();
        return;
      }
      guest.increment();
    }

    await chat.sendMessage(
      text,
      language: lang,
      userId: auth.user?.id,
      accessToken: auth.accessToken,
    );
    _scrollToBottom();
  }

  void _showSaveSheet() async {
    final result = await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.bgPaper,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (_) => const SaveSessionSheet(),
    );

    if (result == true && mounted) {
      final title = context.read<ChatProvider>().sessionTitle;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Session saved as "$title"'),
          backgroundColor: AppColors.textInk,
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4)),
        ),
      );
    }
  }

  void _showGuestLimitModal() {
    showModalBottomSheet(
      context: context,
      backgroundColor: AppColors.bgPaper,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (_) => Padding(
        padding: const EdgeInsets.all(24),
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
            const Text(
              'Free limit reached',
              style: TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.w700,
                color: AppColors.textInk,
              ),
            ),
            const SizedBox(height: 8),
            const Text(
              'You have used all 3 free questions.\nSign in to continue.',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 13,
                color: AppColors.textPencil,
                height: 1.5,
              ),
            ),
            const SizedBox(height: 24),
            Row(children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: () => Navigator.pop(context),
                  style: OutlinedButton.styleFrom(
                    side: const BorderSide(color: AppColors.borderStitch),
                    foregroundColor: AppColors.textGraphite,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(4),
                    ),
                  ),
                  child: const Text('Cancel'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: ElevatedButton(
                  onPressed: () {
                    Navigator.pop(context);
                    Navigator.push(
                      context,
                      MaterialPageRoute(builder: (_) => const LoginScreen()),
                    );
                  },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.textInk,
                    foregroundColor: Colors.white,
                    elevation: 0,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(4),
                    ),
                  ),
                  child: const Text(
                    'SIGN IN',
                    style: TextStyle(
                      fontWeight: FontWeight.w700,
                      letterSpacing: 0.8,
                    ),
                  ),
                ),
              ),
            ]),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final guest = context.watch<GuestProvider>();
    final chat = context.watch<ChatProvider>();

    return Column(
      children: [
        TopNavBar(
          isAuth: auth.isAuthenticated,
          userName: auth.userName,
          showSaveButton: auth.isAuthenticated && chat.hasMessages && !chat.isLoading,
          sessionSaved: chat.sessionSaved,
          onSave: _showSaveSheet,
          onProfileTap: () => ProfileModal.show(context),
        ),
        Expanded(
          child: PaperBackground(
            child: chat.hasMessages
                ? _buildMessageList(chat)
                : _buildWelcomeState(),
          ),
        ),
        ChatInputBar(
          isLoading: chat.isLoading,
          onSend: _sendMessage,
          isAuthenticated: auth.isAuthenticated,
          guestRemaining: guest.remaining,
        ),
      ],
    );
  }

  Widget _buildMessageList(ChatProvider chat) {
    final itemCount = chat.messages.length +
        (chat.isLoading ? 1 : 0) +
        (chat.error != null ? 1 : 0);

    return ListView.builder(
      controller: _scrollCtrl,
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
      itemCount: itemCount,
      itemBuilder: (_, i) {
        // Error banner at bottom
        if (chat.error != null &&
            i == chat.messages.length + (chat.isLoading ? 1 : 0)) {
          return _ErrorRow(
            error: chat.error!,
            onDismiss: () => chat.clearError(),
          );
        }
        // Typing indicator
        if (chat.isLoading && i == chat.messages.length) {
          return const TypingIndicatorBubble();
        }
        final msg = chat.messages[i];
        return MessageBubble(
          isUser: msg.role == MessageRole.user,
          content: msg.content,
          diagram: msg.diagram,
          messageId: msg.id,
          feedbackRating: msg.feedbackRating,
        );
      },
    );
  }

  Widget _buildWelcomeState() {
    final lang = context.watch<LanguageProvider>();
    final prompts = lang.strings.quickPrompts;
    const topics = [
      "Wiring Diagrams",
      "Modbus RTU",
      "I/O Fault",
      "Commissioning",
      "RS-485",
      "Network Topology"
    ];

    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: Column(
        children: [
          const SizedBox(height: 48),
          Container(
            width: 56,
            height: 56,
            decoration: BoxDecoration(
              color: AppColors.teal.withOpacity(0.1),
              border: Border.all(color: AppColors.teal.withOpacity(0.2)),
              borderRadius: BorderRadius.circular(16),
            ),
            child: const Icon(Icons.smart_toy_outlined,
                size: 28, color: AppColors.teal),
          ),
          const SizedBox(height: 22),
          Text(
            lang.strings.welcomeTitle,
            style: const TextStyle(
              fontSize: 22,
              fontWeight: FontWeight.w700,
              color: AppColors.textInk,
            ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 12),
          Text(
            lang.strings.welcomeSubtitle,
            style: const TextStyle(
              fontSize: 13,
              color: AppColors.textPencil,
              height: 1.6,
            ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 24),
          ...prompts.map((q) => _SuggestionCard(
                text: q,
                onTap: () => _sendMessage(q),
              )),
          const SizedBox(height: 20),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            alignment: WrapAlignment.center,
            children: topics
                .map((t) => _TopicChip(
                      text: t,
                      onTap: () => _sendMessage(t),
                    ))
                .toList(),
          ),
          const SizedBox(height: 32),
        ],
      ),
    );
  }


}

class _SuggestionCard extends StatelessWidget {
  final String text;
  final VoidCallback onTap;
  const _SuggestionCard({required this.text, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: double.infinity,
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0xFFFAF7F2), Color(0xFFF0EBE3)],
          ),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.borderStitch),
          boxShadow: AppShadows.raised,
        ),
        child: Row(
          children: [
            const Text(
              "→ ",
              style: TextStyle(
                fontSize: 13,
                color: AppColors.brass,
                fontWeight: FontWeight.w600,
              ),
            ),
            Expanded(
              child: Text(
                text,
                style: const TextStyle(
                  fontSize: 13,
                  color: AppColors.textGraphite,
                  height: 1.4,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _TopicChip extends StatelessWidget {
  final String text;
  final VoidCallback onTap;
  const _TopicChip({required this.text, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0xFFFAF7F2), Color(0xFFF0EBE3)],
          ),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: AppColors.borderStitch),
          boxShadow: AppShadows.raised,
        ),
        child: Text(
          text,
          style: const TextStyle(
            fontSize: 12,
            color: AppColors.textPencil,
            fontWeight: FontWeight.w500,
          ),
        ),
      ),
    );
  }
}

class _ErrorRow extends StatelessWidget {
  final String error;
  final VoidCallback onDismiss;
  const _ErrorRow({required this.error, required this.onDismiss});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: AppColors.danger.withOpacity(0.08),
        borderRadius: BorderRadius.circular(4),
        border: Border.all(color: AppColors.danger.withOpacity(0.25)),
      ),
      child: Row(children: [
        const Icon(Icons.error_outline, size: 14, color: AppColors.danger),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            error,
            style: const TextStyle(fontSize: 12, color: AppColors.danger),
          ),
        ),
        GestureDetector(
          onTap: onDismiss,
          child: const Icon(Icons.close, size: 14, color: AppColors.danger),
        ),
      ]),
    );
  }
}
