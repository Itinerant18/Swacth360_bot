import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../providers/auth_provider.dart';
import '../providers/chat_provider.dart';
import '../providers/language_provider.dart';
import '../services/diagram_service.dart';
import '../theme/app_theme.dart';

class ChatInputBar extends StatefulWidget {
  final bool isLoading;
  final Future<void> Function(String text) onSend;

  const ChatInputBar({
    super.key,
    required this.isLoading,
    required this.onSend,
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
      final has = _ctrl.text.trim().isNotEmpty;
      if (has != _hasText) setState(() => _hasText = has);
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

  void _showDiagramSheet() {
    final types = ['Wiring', 'Power', 'Network', 'Alarm', 'LED', 'Block'];
    showModalBottomSheet(
      context: context,
      backgroundColor: AppColors.bgPaper,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: AppColors.borderHover,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 16),
            const Text(
              'Request Diagram',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w700,
                color: AppColors.textInk,
              ),
            ),
            const SizedBox(height: 6),
            const Text(
              'Select a diagram type to generate',
              style: TextStyle(fontSize: 12, color: AppColors.textPencil),
            ),
            const SizedBox(height: 16),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: types.map((type) {
                return ActionChip(
                  label: Text(type),
                  labelStyle: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: AppColors.textGraphite,
                  ),
                  backgroundColor: AppColors.bgPaperInset,
                  side: const BorderSide(color: AppColors.borderStitch),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(20),
                  ),
                  onPressed: () {
                    Navigator.pop(context);
                    _requestDiagram(type);
                  },
                );
              }).toList(),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _requestDiagram(String type) async {
    final chat = context.read<ChatProvider>();
    final auth = context.read<AuthProvider>();
    final lang = context.read<LanguageProvider>().code;

    final query = _ctrl.text.trim().isNotEmpty
        ? _ctrl.text.trim()
        : 'Show me $type diagram';

    // Add user message
    await chat.sendMessage(
      'Show me $type diagram',
      language: lang,
      userId: auth.user?.id,
      accessToken: auth.accessToken,
    );

    try {
      final data = await DiagramService().requestDiagram(
        query: query,
        diagramType: type.toLowerCase(),
        language: lang,
        accessToken: auth.accessToken,
      );
      await chat.addDiagramMessage(data);
    } catch (e) {
      // Error will show via chat provider
    }
  }

  @override
  Widget build(BuildContext context) {
    final lang = context.watch<LanguageProvider>();

    return Container(
      padding: EdgeInsets.fromLTRB(
        12,
        8,
        12,
        8 + MediaQuery.of(context).padding.bottom,
      ),
      decoration: const BoxDecoration(
        color: Color(0xFFD4CFC7),
        border: Border(top: BorderSide(color: AppColors.borderStitch)),
      ),
      child: Row(
        children: [
          // Diagram button
          GestureDetector(
            onTap: widget.isLoading ? null : _showDiagramSheet,
            child: Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: AppColors.bgPaper,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: AppColors.borderStitch),
              ),
              child: const Icon(
                Icons.schema_outlined,
                size: 18,
                color: AppColors.brass,
              ),
            ),
          ),
          const SizedBox(width: 8),

          // Text field
          Expanded(
            child: Container(
              decoration: BoxDecoration(
                color: AppColors.bgPaper,
                borderRadius: BorderRadius.circular(22),
                border: Border.all(color: AppColors.borderStitch),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _ctrl,
                      maxLines: 4,
                      minLines: 1,
                      textInputAction: TextInputAction.send,
                      onSubmitted: (_) => _send(),
                      style: const TextStyle(
                        fontSize: 14,
                        color: AppColors.textInk,
                      ),
                      decoration: const InputDecoration(
                        hintText: 'Ask SAI about HMS panels...',
                        border: InputBorder.none,
                        enabledBorder: InputBorder.none,
                        focusedBorder: InputBorder.none,
                        contentPadding: EdgeInsets.symmetric(
                          horizontal: 16,
                          vertical: 10,
                        ),
                        filled: false,
                      ),
                    ),
                  ),
                  // Language badge
                  GestureDetector(
                    onTap: () {
                      final next = AppLanguage.values[
                          (lang.language.index + 1) % AppLanguage.values.length];
                      lang.set(next);
                    },
                    child: Container(
                      margin: const EdgeInsets.only(right: 4),
                      padding: const EdgeInsets.symmetric(
                        horizontal: 6,
                        vertical: 3,
                      ),
                      decoration: BoxDecoration(
                        color: AppColors.brass.withOpacity(0.1),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        lang.language.shortCode,
                        style: const TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                          color: AppColors.brass,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(width: 8),

          // Send button
          GestureDetector(
            onTap: _send,
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                gradient: _hasText && !widget.isLoading
                    ? const LinearGradient(
                        colors: [AppColors.brassGlow, AppColors.brass],
                      )
                    : null,
                color: _hasText && !widget.isLoading ? null : AppColors.bgPaperInset,
                borderRadius: BorderRadius.circular(12),
                boxShadow: _hasText && !widget.isLoading
                    ? [
                        BoxShadow(
                          color: AppColors.brass.withOpacity(0.3),
                          blurRadius: 8,
                          offset: const Offset(0, 2),
                        ),
                      ]
                    : null,
              ),
              child: Icon(
                Icons.arrow_upward_rounded,
                size: 20,
                color: _hasText && !widget.isLoading
                    ? Colors.white
                    : AppColors.textFaint,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
