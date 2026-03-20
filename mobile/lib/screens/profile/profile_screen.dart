import 'package:flutter/material.dart';
import '../../theme/app_theme.dart';
import '../../widgets/paper_background.dart';

class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: PaperBackground(
        child: SafeArea(
          child: ListView(
            padding: const EdgeInsets.all(16.0),
            children: [
              // Avatar skeuo-card
              Container(
                decoration: BoxDecoration(
                  color: AppColors.bgPaper,
                  borderRadius: BorderRadius.circular(4),
                  border: Border.all(color: AppColors.borderStitch),
                  boxShadow: AppShadows.card,
                ),
                padding: const EdgeInsets.all(16),
                child: Row(
                  children: [
                    const CircleAvatar(
                      radius: 28,
                      backgroundColor: AppColors.brass,
                      child: Text(
                        "JD",
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w700,
                          color: Colors.white,
                        ),
                      ),
                    ),
                    const SizedBox(width: 14),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          "John Doe",
                          style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.textInk),
                        ),
                        const Text(
                          "john.doe@example.com",
                          style: TextStyle(fontSize: 12, color: AppColors.textPencil),
                        ),
                        const SizedBox(height: 4),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
                          decoration: BoxDecoration(
                            color: AppColors.teal.withOpacity(0.1),
                            border: Border.all(color: AppColors.teal),
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: const Text(
                            "VERIFIED",
                            style: TextStyle(fontSize: 9, fontWeight: FontWeight.w700, color: AppColors.teal),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 12),
              const _SectionHeader("PREFERENCES"),
              Container(
                decoration: BoxDecoration(
                  color: AppColors.bgPaper,
                  borderRadius: BorderRadius.circular(4),
                  border: Border.all(color: AppColors.borderStitch),
                  boxShadow: AppShadows.card,
                ),
                padding: const EdgeInsets.all(12),
                child: Row(
                  children: [
                    const Text(
                      "Language",
                      style: TextStyle(fontSize: 14, color: AppColors.textInk),
                    ),
                    const Spacer(),
                    const _LangPill("EN", true),
                    const SizedBox(width: 8),
                    const _LangPill("বাংলা", false),
                    const SizedBox(width: 8),
                    const _LangPill("हिन्दी", false),
                  ],
                ),
              ),

              const SizedBox(height: 12),
              const _SectionHeader("ABOUT"),
              Container(
                decoration: BoxDecoration(
                  color: AppColors.bgPaper,
                  borderRadius: BorderRadius.circular(4),
                  border: Border.all(color: AppColors.borderStitch),
                  boxShadow: AppShadows.card,
                ),
                child: const Column(
                  children: [
                    _InfoRow("Version", "1.2.0"),
                    Divider(height: 1, thickness: 1, color: AppColors.borderStitch),
                    _InfoRow("Platform", "Cross-Platform"),
                  ],
                ),
              ),

              const SizedBox(height: 12),
              const _SectionHeader("SUPPORT"),
              Container(
                decoration: BoxDecoration(
                  color: AppColors.bgPaper,
                  borderRadius: BorderRadius.circular(4),
                  border: Border.all(color: AppColors.borderStitch),
                  boxShadow: AppShadows.card,
                ),
                child: Column(
                  children: [
                    ListTile(
                      dense: true,
                      title: const Text("Documentation", style: TextStyle(fontSize: 14, color: AppColors.textInk)),
                      trailing: const Icon(Icons.chevron_right, size: 20, color: AppColors.textPencil),
                      onTap: () {},
                    ),
                    const Divider(height: 1, thickness: 1, color: AppColors.borderStitch),
                    ListTile(
                      dense: true,
                      title: const Text("Report Issue", style: TextStyle(fontSize: 14, color: AppColors.textInk)),
                      trailing: const Icon(Icons.chevron_right, size: 20, color: AppColors.textPencil),
                      onTap: () {},
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 24),
              
              // Sign out outline button 
              Container(
                width: double.infinity,
                height: 46,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(4), // sharp
                   border: Border.all(color: AppColors.danger, width: 1.5),
                ),
                child: TextButton(
                  onPressed: () {
                    _showSignOutConfirmation(context);
                  },
                  style: TextButton.styleFrom(
                    foregroundColor: AppColors.danger,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4)),
                  ),
                  child: const Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.logout, size: 16, color: AppColors.danger),
                      SizedBox(width: 8),
                      Text(
                        "SIGN OUT", 
                        style: TextStyle(
                          fontSize: 12, 
                          fontWeight: FontWeight.w700, 
                          letterSpacing: 1.0 // Appox 0.08em * 12
                        )
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _showSignOutConfirmation(BuildContext context) {
    showModalBottomSheet(
      context: context,
      builder: (context) {
        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Center(
                child: Container(
                  margin: const EdgeInsets.only(top: 8, bottom: 16),
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: AppColors.borderStitch,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const Padding(
                padding: EdgeInsets.symmetric(horizontal: 20.0),
                child: Text(
                  "Are you sure you want to sign out?",
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.textInk),
                ),
              ),
              const SizedBox(height: 24),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20.0, vertical: 8.0),
                child: Row(
                  children: [
                    Expanded(
                      child: TextButton(
                        onPressed: () => Navigator.pop(context),
                        style: TextButton.styleFrom(
                          foregroundColor: AppColors.textInk,
                        ),
                        child: const Text("Cancel"),
                      ),
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: ElevatedButton(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppColors.danger,
                          foregroundColor: Colors.white,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4)),
                        ),
                        onPressed: () {},
                        child: const Text("Sign Out"),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 8),
            ],
          ),
        );
      },
    );
  }
}

class _SectionHeader extends StatelessWidget {
  final String title;
  const _SectionHeader(this.title);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 4, 0, 8),
      child: Text(
        title.toUpperCase(),
        style: const TextStyle(
          fontSize: 10,
          fontWeight: FontWeight.w500,
          color: AppColors.textFaint,
          letterSpacing: 2.0, // approx 1.2em * 10
        ),
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  final String title;
  final String value;

  const _InfoRow(this.title, this.value);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 12.0),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(title, style: const TextStyle(fontSize: 14, color: AppColors.textInk)),
          Text(value, style: const TextStyle(fontSize: 14, color: AppColors.textPencil)),
        ],
      ),
    );
  }
}

class _LangPill extends StatelessWidget {
  final String label;
  final bool active;
  const _LangPill(this.label, this.active);

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: active ? AppColors.brass.withOpacity(0.12) : AppColors.bgPaperInset,
        border: Border.all(
          color: active ? AppColors.brass : AppColors.borderStitch,
          width: active ? 1.5 : 1.0,
        ),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 10,
          fontWeight: active ? FontWeight.w700 : FontWeight.normal,
          color: active ? AppColors.brass : AppColors.textPencil,
        ),
      ),
    );
  }
}
