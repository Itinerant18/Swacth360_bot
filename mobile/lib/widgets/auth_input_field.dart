import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

class AuthInputField extends StatefulWidget {
  final String hint;
  final bool isPassword;
  final TextInputType? type;
  final TextEditingController? controller;

  const AuthInputField({
    super.key,
    required this.hint,
    this.isPassword = false,
    this.type,
    this.controller,
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
        borderRadius: BorderRadius.circular(3),
        border: Border.all(
          color: _focused ? AppColors.brass : AppColors.borderStitch,
          width: _focused ? 1.5 : 1.0,
        ),
        boxShadow: _focused ? [
          BoxShadow(
            color: AppColors.brass.withOpacity(0.15),
            blurRadius: 8,
            spreadRadius: 2,
          )
        ] : [],
      ),
      child: TextField(
        controller: widget.controller,
        focusNode: _focusNode,
        obscureText: widget.isPassword,
        keyboardType: widget.isPassword
            ? TextInputType.visiblePassword
            : widget.type ?? TextInputType.text,
        autocorrect: false,
        enableSuggestions: false,
        textCapitalization: TextCapitalization.none,
        smartDashesType: SmartDashesType.disabled,
        smartQuotesType: SmartQuotesType.disabled,
        style: const TextStyle(
          fontFamily: 'monospace', 
          fontSize: 12,
          color: Color(0xFF1C1917),
        ),
        decoration: InputDecoration(
          hintText: widget.hint,
          hintStyle: const TextStyle(
            color: AppColors.textFaint, 
            fontSize: 12,
            fontFamily: 'monospace',
          ),
          contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          border: InputBorder.none,
          enabledBorder: InputBorder.none,
          focusedBorder: InputBorder.none,
        ),
      ),
    );
  }
}
