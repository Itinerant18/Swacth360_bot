import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

class AuthCard extends StatelessWidget {
  final Widget child;
  const AuthCard({super.key, required this.child});

  @override
  Widget build(BuildContext context) {
    return Stack(children: [
      // Main card
      Container(
        width: double.infinity,
        decoration: BoxDecoration(
          color: Colors.white,  // #FFFFFF pure white
          borderRadius: BorderRadius.circular(4),  // SHARP 4px
          border: Border.all(color: AppColors.borderStitch),
          boxShadow: const [
            BoxShadow(color: Color(0x0D000000),
              blurRadius: 25, offset: Offset(0, 10)),
          ]),
        padding: const EdgeInsets.fromLTRB(28, 28, 28, 32),
        child: child,
      ),

      // Top-left brass corner
      Positioned(top: -1, left: -1,
        child: SizedBox(width: 40, height: 40,
          child: DecoratedBox(decoration: BoxDecoration(
            border: const Border(
              top: BorderSide(color: AppColors.brass, width: 2),
              left: BorderSide(color: AppColors.brass, width: 2)),
            borderRadius: const BorderRadius.only(
              topLeft: Radius.circular(4)))))),

      // Bottom-right brass corner
      Positioned(bottom: -1, right: -1,
        child: SizedBox(width: 40, height: 40,
          child: DecoratedBox(decoration: BoxDecoration(
            border: const Border(
              bottom: BorderSide(color: AppColors.brass, width: 2),
              right: BorderSide(color: AppColors.brass, width: 2)),
            borderRadius: const BorderRadius.only(
              bottomRight: Radius.circular(4)))))),
    ]);
  }
}
