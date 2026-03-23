import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

class ChatInputBar extends StatefulWidget {
  final bool isLoading;
  final void Function(String text) onSend;
  final bool isAuthenticated;
  final int guestRemaining;

  const ChatInputBar({
    super.key,
    required this.isLoading,
    required this.onSend,
    this.isAuthenticated = false,
    this.guestRemaining = 3,
  });

  @override
  State<ChatInputBar> createState() => _ChatInputBarState();
}

class _ChatInputBarState extends State<ChatInputBar> {
  final _ctrl = TextEditingController();
  bool _hasText = false;

  @override
  void initState() {
    super.initState();
    _ctrl.addListener(() {
      final h = _ctrl.text.trim().isNotEmpty;
      if (h != _hasText) setState(() => _hasText = h);
    });
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  void _send() {
    final text = _ctrl.text.trim();
    if (text.isEmpty || widget.isLoading) return;
    _ctrl.clear();
    widget.onSend(text);
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: AppColors.bgWhite,
        border: Border(top: BorderSide(color: AppColors.borderStitch)),
      ),
      padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // ── Info strip ─────────────────────────────
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 5),
              child: widget.isAuthenticated
                  ? const Text(
                      'HMS Panel Expert · AI Powered · Diagrams supported',
                      style: TextStyle(fontSize: 9, color: AppColors.textFaint),
                      textAlign: TextAlign.center,
                    )
                  : RichText(
                      textAlign: TextAlign.center,
                      text: TextSpan(
                        style: const TextStyle(fontSize: 9, color: AppColors.textFaint),
                        children: [
                          const TextSpan(text: 'HMS Panel Expert · AI Powered  ·  '),
                          TextSpan(
                            text: '${widget.guestRemaining} free questions left',
                            style: const TextStyle(
                              color: AppColors.brass,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                    ),
            ),
            // ── Input row ──────────────────────────────
            Row(
              children: [
                Expanded(
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 2),
                    decoration: BoxDecoration(
                      color: AppColors.bgPaperInset,
                      borderRadius: BorderRadius.circular(24),
                      border: Border.all(color: AppColors.borderStitch),
                      boxShadow: AppShadows.inset,
                    ),
                    child: TextField(
                      controller: _ctrl,
                      onSubmitted: (_) => _send(),
                      textInputAction: TextInputAction.send,
                      style: const TextStyle(fontSize: 14, color: AppColors.textInk),
                      decoration: const InputDecoration(
                        hintText: "Ask anything...",
                        hintStyle: TextStyle(
                          fontSize: 14,
                          color: AppColors.textFaint,
                        ),
                        border: InputBorder.none,
                        enabledBorder: InputBorder.none,
                        focusedBorder: InputBorder.none,
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                GestureDetector(
                  onTap: _send,
                  child: Container(
                    width: 40,
                    height: 40,
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: (_hasText && !widget.isLoading)
                            ? const [AppColors.brassGlow, AppColors.brass, AppColors.brassDark]
                            : [AppColors.brassGlow.withOpacity(0.4), AppColors.brass.withOpacity(0.4), AppColors.brassDark.withOpacity(0.4)],
                        stops: const [0.0, 0.6, 1.0],
                      ),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: AppColors.brassDark),
                      boxShadow: AppShadows.button,
                    ),
                    child: widget.isLoading
                        ? const Padding(
                            padding: EdgeInsets.all(10),
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              valueColor: AlwaysStoppedAnimation(Colors.white),
                            ),
                          )
                        : const Icon(Icons.send, color: Colors.white, size: 16),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
