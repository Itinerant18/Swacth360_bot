import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

class ChatInputBar extends StatelessWidget {
  const ChatInputBar({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      color: AppColors.bgWhite, // pure white
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
      decoration: const BoxDecoration(
        color: AppColors.bgWhite,
        border: Border(top: BorderSide(color: AppColors.borderStitch)),
      ),
      child: SafeArea(
        top: false,
        child: Row(
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
                child: const TextField(
                  style: TextStyle(fontSize: 14, color: AppColors.textInk),
                  decoration: InputDecoration(
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
              onTap: () {},
              child: Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [AppColors.brassGlow, AppColors.brass, AppColors.brassDark],
                    stops: [0.0, 0.6, 1.0],
                  ),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: AppColors.brassDark),
                  boxShadow: AppShadows.button,
                ),
                child: const Icon(Icons.send, color: Colors.white, size: 16),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
