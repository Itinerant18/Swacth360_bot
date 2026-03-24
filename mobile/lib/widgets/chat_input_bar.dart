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
  final _focusNode = FocusNode();
  bool _hasText = false;
  bool _isFocused = false;
  bool _sendPressed = false;

  @override
  void initState() {
    super.initState();
    _ctrl.addListener(() {
      final h = _ctrl.text.trim().isNotEmpty;
      if (h != _hasText) setState(() => _hasText = h);
    });
    _focusNode.addListener(() {
      setState(() => _isFocused = _focusNode.hasFocus);
    });
  }

  @override
  void dispose() {
    _ctrl.dispose();
    _focusNode.dispose();
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
        boxShadow: [
          BoxShadow(
            color: Color(0x0A000000),
            blurRadius: 8,
            offset: Offset(0, -2),
          ),
        ],
      ),
      padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // ── Info strip ─────────────────────────────
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: widget.isAuthenticated
                  ? const Text(
                      'HMS Panel Expert  ·  AI Powered  ·  Diagrams supported',
                      style: TextStyle(
                          fontSize: 9, color: AppColors.textFaint),
                      textAlign: TextAlign.center,
                    )
                  : Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Text(
                          'HMS Panel Expert  ·  AI Powered  ·  ',
                          style: TextStyle(
                              fontSize: 9,
                              color: AppColors.textFaint),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            color: AppColors.brass.withOpacity(0.12),
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(
                                color: AppColors.brass.withOpacity(0.3)),
                          ),
                          child: Text(
                            '${widget.guestRemaining} left',
                            style: const TextStyle(
                              fontSize: 9,
                              color: AppColors.brass,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                      ],
                    ),
            ),
            // ── Input row ──────────────────────────────
            Row(
              children: [
                Expanded(
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 200),
                    padding: const EdgeInsets.symmetric(
                        horizontal: 18, vertical: 10),
                    decoration: BoxDecoration(
                      color: AppColors.bgPaperInset,
                      borderRadius: BorderRadius.circular(26),
                      border: Border.all(
                        color: _isFocused
                            ? AppColors.brass
                            : AppColors.borderStitch,
                      ),
                      boxShadow: AppShadows.inset,
                    ),
                    child: TextField(
                      controller: _ctrl,
                      focusNode: _focusNode,
                      onSubmitted: (_) => _send(),
                      textInputAction: TextInputAction.send,
                      style: const TextStyle(
                          fontSize: 13, color: AppColors.textInk),
                      decoration: const InputDecoration(
                        hintText:
                            "Ask anything about your panel...",
                        hintStyle: TextStyle(
                          fontSize: 13,
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
                  onTapDown: (_) => setState(() => _sendPressed = true),
                  onTapUp: (_) {
                    setState(() => _sendPressed = false);
                    _send();
                  },
                  onTapCancel: () => setState(() => _sendPressed = false),
                  child: AnimatedScale(
                    scale: _sendPressed ? 0.92 : 1.0,
                    duration: const Duration(milliseconds: 150),
                    child: Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: (_hasText && !widget.isLoading)
                            ? const [
                                AppColors.brassGlow,
                                AppColors.brass,
                                AppColors.brassDark
                              ]
                            : [
                                AppColors.brassGlow.withOpacity(0.4),
                                AppColors.brass.withOpacity(0.4),
                                AppColors.brassDark.withOpacity(0.4)
                              ],
                        stops: const [0.0, 0.6, 1.0],
                      ),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: AppColors.brassDark),
                      boxShadow: AppShadows.button,
                    ),
                    child: widget.isLoading
                        ? const Padding(
                            padding: EdgeInsets.all(12),
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              valueColor:
                                  AlwaysStoppedAnimation(Colors.white),
                            ),
                          )
                        : const Icon(Icons.send,
                            color: Colors.white, size: 18),
                  ),
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
