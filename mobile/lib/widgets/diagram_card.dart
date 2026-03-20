import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

class DiagramCard extends StatelessWidget {
  final String mermaidCode;

  const DiagramCard({super.key, required this.mermaidCode});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.bgPaper,
        borderRadius: BorderRadius.circular(4),
        border: Border.all(color: AppColors.borderStitch),
        boxShadow: AppShadows.card,
      ),
      padding: const EdgeInsets.all(14),
      child: const Text(
        "[Mermaid Diagram WebView Placeholder]",
        style: TextStyle(
          fontSize: 14,
          color: AppColors.textPencil,
          fontStyle: FontStyle.italic,
        ),
      ),
    );
  }
}
