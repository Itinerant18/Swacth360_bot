import 'package:flutter/material.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:provider/provider.dart';

import '../models/message_model.dart';
import '../providers/auth_provider.dart';
import '../providers/chat_provider.dart';
import '../services/feedback_service.dart';
import '../theme/app_theme.dart';
import 'diagram_card.dart';

class MessageBubble extends StatelessWidget {
  final ChatMessage message;
  const MessageBubble({super.key, required this.message});

  @override
  Widget build(BuildContext context) {
    final isUser = message.role == MessageRole.user;
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        mainAxisAlignment: isUser ? MainAxisAlignment.end : MainAxisAlignment.start,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (!isUser) ...[
            _AssistantAvatar(),
            const SizedBox(width: 8),
          ],
          Flexible(
            child: Column(
              crossAxisAlignment:
                  isUser ? CrossAxisAlignment.end : CrossAxisAlignment.start,
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  decoration: BoxDecoration(
                    color: isUser ? AppColors.leather : AppColors.bgPaper,
                    borderRadius: BorderRadius.only(
                      topLeft: const Radius.circular(16),
                      topRight: const Radius.circular(16),
                      bottomLeft: Radius.circular(isUser ? 16 : 4),
                      bottomRight: Radius.circular(isUser ? 4 : 16),
                    ),
                    border: isUser
                        ? null
                        : Border.all(color: AppColors.borderStitch),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withOpacity(0.04),
                        blurRadius: 4,
                        offset: const Offset(0, 2),
                      ),
                    ],
                  ),
                  child: message.diagram != null
                      ? DiagramCard(data: message.diagram!)
                      : isUser
                          ? Text(
                              message.content,
                              style: const TextStyle(
                                fontSize: 14,
                                color: Colors.white,
                                height: 1.5,
                              ),
                            )
                          : MarkdownBody(
                              data: message.content,
                              styleSheet: MarkdownStyleSheet(
                                p: const TextStyle(
                                  fontSize: 14,
                                  color: AppColors.textInk,
                                  height: 1.6,
                                ),
                                code: TextStyle(
                                  fontSize: 12,
                                  backgroundColor: AppColors.bgPaperInset,
                                  color: AppColors.textGraphite,
                                ),
                                codeblockDecoration: BoxDecoration(
                                  color: AppColors.bgPaperInset,
                                  borderRadius: BorderRadius.circular(8),
                                  border: Border.all(color: AppColors.borderStitch),
                                ),
                                h1: const TextStyle(
                                  fontSize: 18,
                                  fontWeight: FontWeight.w700,
                                  color: AppColors.textInk,
                                ),
                                h2: const TextStyle(
                                  fontSize: 16,
                                  fontWeight: FontWeight.w700,
                                  color: AppColors.textInk,
                                ),
                                h3: const TextStyle(
                                  fontSize: 15,
                                  fontWeight: FontWeight.w600,
                                  color: AppColors.textInk,
                                ),
                                listBullet: const TextStyle(
                                  fontSize: 14,
                                  color: AppColors.textGraphite,
                                ),
                                strong: const TextStyle(
                                  fontWeight: FontWeight.w700,
                                  color: AppColors.textInk,
                                ),
                                em: const TextStyle(
                                  fontStyle: FontStyle.italic,
                                  color: AppColors.textGraphite,
                                ),
                                blockquoteDecoration: BoxDecoration(
                                  color: AppColors.brass.withOpacity(0.06),
                                  border: const Border(
                                    left: BorderSide(
                                      color: AppColors.brass,
                                      width: 3,
                                    ),
                                  ),
                                ),
                              ),
                            ),
                ),
                // Feedback buttons for assistant messages (not diagrams)
                if (!isUser && message.diagram == null)
                  _FeedbackRow(message: message),
              ],
            ),
          ),
          if (isUser) const SizedBox(width: 8),
        ],
      ),
    );
  }
}

class _AssistantAvatar extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      width: 26,
      height: 26,
      margin: const EdgeInsets.only(top: 2),
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
            fontSize: 11,
            fontWeight: FontWeight.w800,
          ),
        ),
      ),
    );
  }
}

class _FeedbackRow extends StatelessWidget {
  final ChatMessage message;
  const _FeedbackRow({required this.message});

  @override
  Widget build(BuildContext context) {
    final rating = message.feedbackRating;

    return Padding(
      padding: const EdgeInsets.only(top: 4),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _FeedbackButton(
            icon: Icons.thumb_up_outlined,
            activeIcon: Icons.thumb_up,
            isActive: rating == 1,
            isDisabled: rating != null,
            activeColor: AppColors.teal,
            onTap: () => _submit(context, 1),
          ),
          const SizedBox(width: 8),
          _FeedbackButton(
            icon: Icons.thumb_down_outlined,
            activeIcon: Icons.thumb_down,
            isActive: rating == -1,
            isDisabled: rating != null,
            activeColor: AppColors.error,
            onTap: () => _submit(context, -1),
          ),
        ],
      ),
    );
  }

  void _submit(BuildContext context, int rating) {
    final chat = context.read<ChatProvider>();
    final auth = context.read<AuthProvider>();

    chat.updateMessageFeedback(message.id, rating);

    if (chat.activeConversationId != null) {
      FeedbackService().submitFeedback(
        conversationId: chat.activeConversationId!,
        messageId: message.id,
        rating: rating,
        accessToken: auth.accessToken,
      );
    }
  }
}

class _FeedbackButton extends StatelessWidget {
  final IconData icon;
  final IconData activeIcon;
  final bool isActive;
  final bool isDisabled;
  final Color activeColor;
  final VoidCallback onTap;

  const _FeedbackButton({
    required this.icon,
    required this.activeIcon,
    required this.isActive,
    required this.isDisabled,
    required this.activeColor,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: isDisabled ? null : onTap,
      child: AnimatedSwitcher(
        duration: const Duration(milliseconds: 200),
        child: Icon(
          isActive ? activeIcon : icon,
          key: ValueKey(isActive),
          size: 14,
          color: isActive ? activeColor : AppColors.textFaint,
        ),
      ),
    );
  }
}

class TypingIndicator extends StatelessWidget {
  const TypingIndicator({super.key});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _AssistantAvatar(),
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: BoxDecoration(
              color: AppColors.bgPaper,
              borderRadius: const BorderRadius.only(
                topLeft: Radius.circular(16),
                topRight: Radius.circular(16),
                bottomRight: Radius.circular(16),
                bottomLeft: Radius.circular(4),
              ),
              border: Border.all(color: AppColors.borderStitch),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: List.generate(3, (i) {
                return Padding(
                  padding: EdgeInsets.only(left: i == 0 ? 0 : 4),
                  child: _Dot(delay: i * 200),
                );
              }),
            ),
          ),
        ],
      ),
    );
  }
}

class _Dot extends StatefulWidget {
  final int delay;
  const _Dot({required this.delay});

  @override
  State<_Dot> createState() => _DotState();
}

class _DotState extends State<_Dot> with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;
  late final Animation<double> _anim;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 600),
    );
    _anim = Tween(begin: 0.3, end: 1.0).animate(
      CurvedAnimation(parent: _ctrl, curve: Curves.easeInOut),
    );
    Future.delayed(Duration(milliseconds: widget.delay), () {
      if (mounted) _ctrl.repeat(reverse: true);
    });
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: _anim,
      child: Container(
        width: 6,
        height: 6,
        decoration: const BoxDecoration(
          color: AppColors.textFaint,
          shape: BoxShape.circle,
        ),
      ),
    );
  }
}
