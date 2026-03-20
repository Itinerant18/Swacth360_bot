import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

class DarkButton extends StatelessWidget {
  final String label;
  final VoidCallback? onPressed;
  final bool isLoading;

  const DarkButton({
    super.key, 
    required this.label,
    this.onPressed, 
    this.isLoading = false,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity, 
      height: 46,
      child: ElevatedButton(
        onPressed: isLoading ? null : onPressed,
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.textInk,  // #1C1917
          foregroundColor: Colors.white,
          elevation: 0,
          shadowColor: Colors.transparent,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4)),
          textStyle: const TextStyle(
            fontSize: 13, 
            fontWeight: FontWeight.w700,
            letterSpacing: 1.0, 
            fontFamily: 'monospace',
          ),
        ),
        child: isLoading
          ? const SizedBox(width: 14, height: 14,
              child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
          : Text(label.toUpperCase()),
      ),
    );
  }
}
