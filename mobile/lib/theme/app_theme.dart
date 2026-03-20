import 'package:flutter/material.dart';

class AppColors {
  // Surfaces
  static const bgDesk        = Color(0xFFE8E0D4); // warm linen desk
  static const bgPaper       = Color(0xFFFAF7F2); // cream paper
  static const bgPaperInset  = Color(0xFFF0EBE3); // inset paper
  static const bgWhite       = Color(0xFFFFFFFF); // pure white — used for cards/inputs
  static const bgLeather     = Color(0xFF4B2E22);
  static const bgLeatherLight= Color(0xFF5F473A);
  static const transparent   = Colors.transparent;

  // Accents
  static const brass         = Color(0xFFCA8A04);
  static const brassGlow     = Color(0xFFEAB308);
  static const brassDark     = Color(0xFFA16207);
  static const teal          = Color(0xFF0D9488);
  static const tealLight     = Color(0xFF14B8A6);
  static const success       = Color(0xFF16A34A);
  static const danger        = Color(0xFFDC2626);
  static const warning       = Color(0xFFD97706);

  // Text hierarchy
  static const textInk       = Color(0xFF1C1917);
  static const textGraphite  = Color(0xFF44403C);
  static const textPencil    = Color(0xFF78716C);
  static const textFaint     = Color(0xFFA8A29E);

  // Borders
  static const borderStitch  = Color(0xFFD6CFC4);
  static const borderHover   = Color(0xFFC4BCB0);
  static const borderAccent  = Color(0xFFE8E0D4); // lighter border
}

class AppShadows {
  // --shadow-raised
  static const raised = [
    BoxShadow(color: Color(0x99FFFFFF), blurRadius: 0, offset: Offset(0, 1), spreadRadius: 0),
    BoxShadow(color: Color(0x14000000), blurRadius: 4, offset: Offset(0, 2)),
    BoxShadow(color: Color(0x0F000000), blurRadius: 12, offset: Offset(0, 6)),
  ];

  // --shadow-card
  static const card = [
    BoxShadow(color: Color(0xB3FFFFFF), blurRadius: 0, offset: Offset(0, 1)),
    BoxShadow(color: Color(0x1A000000), blurRadius: 6, offset: Offset(0, 2)),
    BoxShadow(color: Color(0x0F000000), blurRadius: 24, offset: Offset(0, 8)),
  ];

  // --shadow-inset (for inputs)
  static const inset = [
    BoxShadow(color: Color(0x1F000000), blurRadius: 4, offset: Offset(0, 2), spreadRadius: 0),
  ];

  // --shadow-button
  static const button = [
    BoxShadow(color: Color(0x4DFFFFFF), blurRadius: 0, offset: Offset(0, 1)),
    BoxShadow(color: Color(0x26000000), blurRadius: 4, offset: Offset(0, 2)),
    BoxShadow(color: Color(0x14000000), blurRadius: 8, offset: Offset(0, 4)),
  ];
}

class AppTheme {
  static ThemeData get theme {
    return ThemeData(
      useMaterial3: true,
      scaffoldBackgroundColor: AppColors.bgDesk,

      // Set font to Trebuchet MS equivalent
      textTheme: ThemeData.light().textTheme.apply(
        bodyColor: AppColors.textInk,
        displayColor: AppColors.textInk,
      ),

      // All Material defaults MUST be neutralized:
      appBarTheme: const AppBarTheme(
        elevation: 0,
        scrolledUnderElevation: 0,  // CRITICAL — no color on scroll
        surfaceTintColor: Colors.transparent,
        backgroundColor: Colors.transparent,
      ),

      cardTheme: const CardTheme(elevation: 0, color: Colors.white),

      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          elevation: 0,
          shadowColor: Colors.transparent,
        ),
      ),

      dividerTheme: const DividerThemeData(
        color: AppColors.borderStitch, thickness: 1, space: 1,
      ),

      bottomSheetTheme: const BottomSheetThemeData(
        backgroundColor: AppColors.bgPaper,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(8)),
        ),
      ),

      inputDecorationTheme: const InputDecorationTheme(
        border: InputBorder.none,
        enabledBorder: InputBorder.none,
        focusedBorder: InputBorder.none,
        filled: false,
      ),
    );
  }
}
