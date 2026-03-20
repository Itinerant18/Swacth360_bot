import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

class ErrorBanner extends StatelessWidget {
  final String error;

  const ErrorBanner({super.key, required this.error});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.danger.withOpacity(0.08),
        borderRadius: BorderRadius.circular(4),
        border: Border.all(color: AppColors.danger.withOpacity(0.25)),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          const Icon(Icons.close, size: 14, color: AppColors.danger),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              error,
              style: const TextStyle(
                fontSize: 12,
                color: AppColors.danger,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
