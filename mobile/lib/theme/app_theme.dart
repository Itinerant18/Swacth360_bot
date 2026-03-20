import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class AppColors {
  // Backgrounds (from website CSS)
  static const Color bgDesk = Color(0xFFE8E0D4);
  static const Color bgPaper = Color(0xFFFAF7F2);
  static const Color bgPaperInset = Color(0xFFF0EBE3);

  // Text hierarchy
  static const Color textInk = Color(0xFF1C1917);
  static const Color textGraphite = Color(0xFF44403C);
  static const Color textPencil = Color(0xFF78716C);
  static const Color textFaint = Color(0xFFA8A29E);

  // Accents
  static const Color brass = Color(0xFFCA8A04);
  static const Color brassGlow = Color(0xFFEAB308);
  static const Color teal = Color(0xFF0D9488);
  static const Color tealLight = Color(0xFF14B8A6);

  // User message bubbles (leather)
  static const Color leather = Color(0xFF4B2E22);
  static const Color leatherLight = Color(0xFF5F473A);

  // Borders
  static const Color borderStitch = Color(0xFFD6CFC4);
  static const Color borderHover = Color(0xFFC4BCB0);

  // Status
  static const Color success = Color(0xFF16A34A);
  static const Color error = Color(0xFFDC2626);
  static const Color warning = Color(0xFFD97706);
}

class AppTheme {
  static ThemeData get theme => ThemeData(
        useMaterial3: true,
        scaffoldBackgroundColor: AppColors.bgDesk,
        colorScheme: ColorScheme.fromSeed(
          seedColor: AppColors.brass,
          brightness: Brightness.light,
          surface: AppColors.bgPaper,
        ),
        textTheme: GoogleFonts.dmSansTextTheme().apply(
          bodyColor: AppColors.textInk,
          displayColor: AppColors.textInk,
        ),
        appBarTheme: AppBarTheme(
          backgroundColor: const Color(0xFFD4CFC7),
          foregroundColor: AppColors.textInk,
          elevation: 0,
          shadowColor: Colors.black.withOpacity(0.08),
          surfaceTintColor: Colors.transparent,
          centerTitle: false,
          titleTextStyle: GoogleFonts.dmSans(
            color: AppColors.textInk,
            fontSize: 17,
            fontWeight: FontWeight.w600,
          ),
        ),
        elevatedButtonTheme: ElevatedButtonThemeData(
          style: ElevatedButton.styleFrom(
            backgroundColor: AppColors.brass,
            foregroundColor: AppColors.textInk,
            textStyle: GoogleFonts.dmSans(fontWeight: FontWeight.w700, letterSpacing: 0.5),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            elevation: 2,
            shadowColor: AppColors.brass.withOpacity(0.3),
          ),
        ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: AppColors.bgPaperInset,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: AppColors.borderStitch),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: AppColors.borderStitch),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: AppColors.brass, width: 1.5),
          ),
          hintStyle: const TextStyle(color: AppColors.textFaint, fontSize: 14),
          contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        ),
        cardTheme: CardThemeData(
          color: AppColors.bgPaper,
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
            side: const BorderSide(color: AppColors.borderStitch),
          ),
          margin: EdgeInsets.zero,
        ),
        dividerTheme: const DividerThemeData(color: AppColors.borderStitch, thickness: 1),
        snackBarTheme: SnackBarThemeData(
          backgroundColor: AppColors.textInk,
          contentTextStyle: GoogleFonts.dmSans(color: Colors.white, fontSize: 13),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          behavior: SnackBarBehavior.floating,
          elevation: 4,
        ),
        popupMenuTheme: PopupMenuThemeData(
          color: AppColors.bgPaper,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
            side: const BorderSide(color: AppColors.borderStitch),
          ),
          elevation: 4,
        ),
      );
}