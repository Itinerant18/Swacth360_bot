import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:provider/provider.dart';
import '../models/message_model.dart';
import '../providers/chat_provider.dart';
import '../theme/app_theme.dart';
import 'diagram_card.dart';

class MessageBubble extends StatelessWidget {
  final bool isUser;
  final String content;
  final DiagramData? diagram;
  final String messageId;
  final int? feedbackRating;

  const MessageBubble({
    super.key,
    required this.isUser,
    required this.content,
    this.diagram,
    required this.messageId,
    this.feedbackRating,
  });

  void _showCopySheet(BuildContext context) {
    showModalBottomSheet(
      context: context,
      backgroundColor: AppColors.bgPaper,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(12)),
      ),
      builder: (_) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 40,
              height: 4,
              margin: const EdgeInsets.only(top: 8, bottom: 12),
              decoration: BoxDecoration(
                color: AppColors.borderStitch,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            ListTile(
              leading: const Icon(Icons.copy,
                  size: 20, color: AppColors.textGraphite),
              title: const Text('Copy message',
                  style:
                      TextStyle(fontSize: 14, color: AppColors.textInk)),
              onTap: () {
                Clipboard.setData(ClipboardData(text: content));
                Navigator.pop(context);
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text('Copied to clipboard'),
                    duration: Duration(seconds: 2),
                  ),
                );
              },
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (isUser) {
      return _buildUserBubble(context);
    } else {
      return _buildAssistantBubble(context);
    }
  }

  Widget _buildUserBubble(BuildContext context) {
    final bubbleContainer = Container(
      padding:
          const EdgeInsets.symmetric(horizontal: 14.0, vertical: 10.0),
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            Color(0xFF5F473A),
            Color(0xFF4B2E22),
            Color(0xFF3A2118)
          ],
          stops: [0.0, 0.4, 1.0],
        ),
        borderRadius: BorderRadius.only(
          topLeft: Radius.circular(16),
          topRight: Radius.circular(16),
          bottomLeft: Radius.circular(16),
          bottomRight: Radius.circular(4),
        ),
        boxShadow: [
          BoxShadow(
              color: Color(0x4D000000),
              blurRadius: 4,
              offset: Offset(0, 2)),
          BoxShadow(
              color: Color(0x14FFFFFF),
              blurRadius: 0,
              offset: Offset(0, 1)),
        ],
      ),
      child: Text(
        content,
        style: const TextStyle(
          fontSize: 14,
          color: Color(0xFFFAF7F2),
          height: 1.5,
        ),
      ),
    );

    return Padding(
      padding:
          const EdgeInsets.only(bottom: 16.0, left: 40.0, right: 16.0),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.end,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Flexible(
            child: GestureDetector(
              onLongPress: () => _showCopySheet(context),
              child: bubbleContainer,
            ),
          ),
          const SizedBox(width: 8),
          const CircleAvatar(
            radius: 14,
            backgroundColor: Color(0xFF4B2E22),
            child:
                Icon(Icons.person, size: 14, color: Color(0xFFFAF7F2)),
          ),
        ],
      ),
    );
  }

  Widget _buildAssistantBubble(BuildContext context) {
    Widget bubbleContent;

    if (diagram != null) {
      bubbleContent = DiagramCard(diagram: diagram!);
    } else {
      bubbleContent = MarkdownBody(
        data: content,
        selectable: true,
        styleSheet: MarkdownStyleSheet(
          p: const TextStyle(
              fontSize: 14, color: AppColors.textInk, height: 1.45),
          code: const TextStyle(
            fontSize: 12,
            fontFamily: 'monospace',
            color: AppColors.teal,
            backgroundColor: Color(0xFFF0EBE3),
          ),
          codeblockDecoration: BoxDecoration(
            color: const Color(0xFFF0EBE3),
            borderRadius: BorderRadius.circular(6),
            border: Border.all(color: AppColors.borderStitch),
          ),
          h1: const TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w700,
              color: AppColors.textInk),
          h2: const TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w700,
              color: AppColors.textInk),
          h3: const TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w700,
              color: AppColors.textInk),
          listBullet: const TextStyle(
              fontSize: 14, color: AppColors.textInk),
          strong: const TextStyle(
              fontWeight: FontWeight.w700, color: AppColors.textInk),
          em: const TextStyle(
              fontStyle: FontStyle.italic,
              color: AppColors.textGraphite),
        ),
      );
    }

    final bubbleContainer = Container(
      decoration: BoxDecoration(
        color: AppColors.bgPaper,
        borderRadius: const BorderRadius.only(
          topLeft: Radius.circular(4),
          topRight: Radius.circular(16),
          bottomLeft: Radius.circular(16),
          bottomRight: Radius.circular(16),
        ),
        border: Border.all(color: AppColors.borderStitch),
        boxShadow: AppShadows.card,
      ),
      padding: const EdgeInsets.all(16),
      child: bubbleContent,
    );

    return Padding(
      padding:
          const EdgeInsets.only(bottom: 16.0, left: 16.0, right: 40.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.start,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 30,
                height: 30,
                decoration: BoxDecoration(
                  color: AppColors.brass,
                  borderRadius: BorderRadius.circular(6),
                ),
                child: const Center(
                  child: Text(
                    'S',
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w800,
                      color: Colors.white,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Flexible(
                child: GestureDetector(
                  onLongPress: () => _showCopySheet(context),
                  child: bubbleContainer,
                ),
              ),
            ],
          ),
          // Feedback row for assistant text messages (not diagrams)
          if (!isUser && diagram == null) ...[
            Padding(
              padding: const EdgeInsets.only(left: 36, top: 6, bottom: 4),
              child: Divider(
                height: 1,
                thickness: 0.5,
                color: AppColors.borderStitch.withOpacity(0.5),
              ),
            ),
            Padding(
              padding: EdgeInsets.zero,
              child: Row(children: [
                const SizedBox(width: 40), // offset to align under bubble
                Text(
                  'Helpful?',
                  style: TextStyle(
                    fontSize: 10,
                    color: AppColors.textFaint,
                  ),
                ),
                const SizedBox(width: 8),
                IconButton(
                  icon: Icon(
                    Icons.thumb_up_outlined,
                    size: 13,
                    color: feedbackRating == 1
                        ? AppColors.teal
                        : AppColors.textFaint,
                  ),
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints(),
                  onPressed: () => context
                      .read<ChatProvider>()
                      .updateMessageFeedback(messageId, 1),
                ),
                const SizedBox(width: 8),
                IconButton(
                  icon: Icon(
                    Icons.thumb_down_outlined,
                    size: 13,
                    color: feedbackRating == -1
                        ? AppColors.danger
                        : AppColors.textFaint,
                  ),
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints(),
                  onPressed: () => context
                      .read<ChatProvider>()
                      .updateMessageFeedback(messageId, -1),
                ),
              ]),
            ),
          ],
        ],
      ),
    );
  }
}

class TypingIndicatorBubble extends StatelessWidget {
  const TypingIndicatorBubble({super.key});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding:
          const EdgeInsets.only(bottom: 16.0, left: 16.0, right: 40.0),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.start,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 28,
            height: 28,
            decoration: BoxDecoration(
              color: AppColors.brass,
              borderRadius: BorderRadius.circular(6),
            ),
            child: const Center(
              child: Text(
                'S',
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w800,
                  color: Colors.white,
                ),
              ),
            ),
          ),
          const SizedBox(width: 8),
          Flexible(
            child: Container(
              decoration: BoxDecoration(
                color: AppColors.bgPaper,
                borderRadius: const BorderRadius.only(
                  topLeft: Radius.circular(4),
                  topRight: Radius.circular(16),
                  bottomLeft: Radius.circular(16),
                  bottomRight: Radius.circular(16),
                ),
                border: Border.all(color: AppColors.borderStitch),
                boxShadow: AppShadows.card,
              ),
              padding: const EdgeInsets.all(16),
              child: const Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  _TypingDot(delay: 0),
                  SizedBox(width: 5),
                  _TypingDot(delay: 200),
                  SizedBox(width: 5),
                  _TypingDot(delay: 400),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _TypingDot extends StatefulWidget {
  final int delay;

  const _TypingDot({required this.delay});

  @override
  State<_TypingDot> createState() => _TypingDotState();
}

class _TypingDotState extends State<_TypingDot>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _animation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1200),
    );
    _animation = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(
        parent: _controller,
        curve: Curves.easeInOutSine,
      ),
    );

    Future.delayed(Duration(milliseconds: widget.delay), () {
      if (mounted) {
        _controller.repeat(reverse: true);
      }
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _animation,
      builder: (context, child) {
        return Transform.translate(
          offset: Offset(0, -4 * _animation.value),
          child: Opacity(
            opacity: 0.5 + (0.5 * _animation.value),
            child: Container(
              width: 7,
              height: 7,
              decoration: const BoxDecoration(
                color: AppColors.brass,
                shape: BoxShape.circle,
              ),
            ),
          ),
        );
      },
    );
  }
}
