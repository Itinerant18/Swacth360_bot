import 'package:flutter/material.dart';
import '../../theme/app_theme.dart';
import '../../widgets/top_nav_bar.dart';
import '../../widgets/paper_background.dart';
import '../../widgets/chat_input_bar.dart';

class ChatScreen extends StatelessWidget {
  const ChatScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        const TopNavBar(),
        Expanded(
          child: PaperBackground(
            child: _buildWelcomeState(),
          ),
        ),
        const ChatInputBar(),
        _buildFooterStrip(),
      ],
    );
  }

  Widget _buildWelcomeState() {
    final questions = [
      "I have an I/O fault, what do I do?",
      "Can you show me a wiring diagram?",
      "How to set up Modbus RTU?",
    ];
    
    final topics = [
      "Wiring Diagrams", "Modbus RTU", "I/O Fault",
      "Commissioning", "RS-485", "Network Topology"
    ];

    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 20.0),
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
              child: const Icon(Icons.smart_toy_outlined, size: 28, color: AppColors.teal),
            ),
            const SizedBox(height: 22),
            const Text(
              "Ask about HMS Panel Troubleshooting",
              style: TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.w700,
                color: AppColors.textInk,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 12),
            const Text(
              "I am SAI, your HMS support assistant...",
              style: TextStyle(
                fontSize: 13,
                color: AppColors.textPencil,
                height: 1.6,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 24),
            ...questions.map((q) => _SuggestionCard(q)),
            const SizedBox(height: 20),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              alignment: WrapAlignment.center,
              children: topics.map((t) => _TopicChip(t)).toList(),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildFooterStrip() {
    return Container(
      color: AppColors.bgDesk,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      child: SafeArea(
        top: false,
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Text(
              "HMS Panel Expert · AI Powered · Diagrams supported",
              style: TextStyle(fontSize: 9, color: AppColors.textFaint),
            ),
            const Text(
              "10 free questions left",
              style: TextStyle(fontSize: 9, color: AppColors.brass, fontWeight: FontWeight.w600),
            ),
          ],
        ),
      ),
    );
  }
}

class _SuggestionCard extends StatelessWidget {
  final String text;
  const _SuggestionCard(this.text);

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () {},
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
              style: TextStyle(fontSize: 13, color: AppColors.brass, fontWeight: FontWeight.w600),
            ),
            Expanded(
              child: Text(
                text,
                style: const TextStyle(fontSize: 13, color: AppColors.textGraphite, height: 1.4),
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
  const _TopicChip(this.text);

  @override
  Widget build(BuildContext context) {
    return Container(
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
        style: const TextStyle(fontSize: 12, color: AppColors.textPencil, fontWeight: FontWeight.w500),
      ),
    );
  }
}
