import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

class AuthInputField extends StatefulWidget {
  final String hint;
  final bool isPassword;
  final TextInputType? type;

  const AuthInputField({
    super.key,
    required this.hint,
    this.isPassword = false,
    this.type,
  });

  @override
  State<AuthInputField> createState() => _AuthInputFieldState();
}

class _AuthInputFieldState extends State<AuthInputField> {
  final _focusNode = FocusNode();
  bool _focused = false;
  
  @override 
  void initState() {
    super.initState();
    _focusNode.addListener(() => setState(() => _focused = _focusNode.hasFocus));
  }

  @override
  void dispose() {
    _focusNode.dispose();
    super.dispose();
  }

  @override 
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(4),
        border: Border.all(
          color: _focused ? AppColors.brass : AppColors.borderStitch,
          width: _focused ? 1.5 : 1.0,
        ),
        boxShadow: _focused ? [
          BoxShadow(
            color: AppColors.brass.withOpacity(0.12),
            blurRadius: 0, 
            spreadRadius: 3,
          )
        ] : [],
      ),
      child: TextField(
        focusNode: _focusNode,
        obscureText: widget.isPassword,
        keyboardType: widget.type,
        style: const TextStyle(
          fontFamily: 'monospace', 
          fontSize: 13,
          color: Color(0xFF1C1917),
        ),
        decoration: InputDecoration(
          hintText: widget.hint,
          hintStyle: const TextStyle(
            color: AppColors.textFaint, 
            fontSize: 13,
            fontFamily: 'monospace',
          ),
          contentPadding: const EdgeInsets.symmetric(horizontal: 13, vertical: 11),
          border: InputBorder.none,
          enabledBorder: InputBorder.none,
          focusedBorder: InputBorder.none,
        ),
      ),
    );
  }
}
