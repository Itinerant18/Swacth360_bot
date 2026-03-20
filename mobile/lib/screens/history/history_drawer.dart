import 'package:flutter/material.dart';
import '../../theme/app_theme.dart';
import '../../widgets/paper_background.dart';

class HistoryDrawer extends StatelessWidget {
  const HistoryDrawer({super.key});

  @override
  Widget build(BuildContext context) {
    return Drawer(
      width: MediaQuery.of(context).size.width * 0.78,
      child: PaperBackground(
        child: Column(
          children: [
            // Header
            Container(
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Color(0xFFE8E3DC),
                    Color(0xFFD4CFC7),
                    Color(0xFFC4BEB5),
                  ],
                ),
                border: Border(bottom: BorderSide(color: AppColors.borderStitch)),
              ),
              child: SafeArea(
                bottom: false,
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 12.0),
                  child: Row(
                    children: [
                      const Icon(Icons.view_sidebar, size: 18, color: AppColors.textGraphite),
                      const SizedBox(width: 8),
                      const Text(
                        "HISTORY",
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: AppColors.textInk,
                          letterSpacing: 1.5,
                        ),
                      ),
                      const Spacer(),
                      IconButton(
                        icon: const Icon(Icons.add, size: 20, color: AppColors.brass),
                        padding: EdgeInsets.zero,
                        constraints: const BoxConstraints(),
                        onPressed: () {},
                      ),
                    ],
                  ),
                ),
              ),
            ),
            
            // Body
            Expanded(
              child: Center(
                child: Container(
                  margin: const EdgeInsets.all(16),
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    color: AppColors.bgPaper,
                    borderRadius: BorderRadius.circular(4),
                    border: Border.all(color: AppColors.borderStitch),
                    boxShadow: AppShadows.card,
                  ),
                  child: const Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        "No conversations yet",
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: AppColors.textInk,
                        ),
                        textAlign: TextAlign.center,
                      ),
                      SizedBox(height: 4),
                      Text(
                        "Your recent chats will appear here.",
                        style: TextStyle(
                          fontSize: 12,
                          color: AppColors.textPencil,
                        ),
                        textAlign: TextAlign.center,
                      ),
                    ],
                  ),
                ),
              ),
            ),

            // Footer
            Container(
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Color(0xFFE8E3DC),
                    Color(0xFFD4CFC7),
                    Color(0xFFC4BEB5),
                  ],
                ),
                border: Border(top: BorderSide(color: AppColors.borderStitch)),
              ),
              child: SafeArea(
                top: false,
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 16.0),
                  child: Row(
                    children: [
                      const CircleAvatar(
                        radius: 18,
                        backgroundColor: AppColors.textGraphite,
                        child: Text(
                          "G",
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                            color: Colors.white,
                          ),
                        ),
                      ),
                      const SizedBox(width: 10),
                      const Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            "Guest",
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                              color: AppColors.textInk,
                            ),
                          ),
                          Text(
                            "0 saved conversations",
                            style: TextStyle(
                              fontSize: 11,
                              color: AppColors.textFaint,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
