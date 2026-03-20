class ConversationModel {
  final String id;
  final String title;
  final DateTime createdAt;
  final DateTime updatedAt;
  final int messageCount;

  ConversationModel({
    required this.id,
    required this.title,
    required this.createdAt,
    required this.updatedAt,
    this.messageCount = 0,
  });

  factory ConversationModel.fromJson(Map<String, dynamic> json) {
    return ConversationModel(
      id: json['id'] as String,
      title: json['title'] as String? ?? 'Untitled',
      createdAt: DateTime.parse(json['created_at'] as String),
      updatedAt: DateTime.parse(json['updated_at'] as String),
      messageCount: json['message_count'] as int? ?? 0,
    );
  }

  String get groupLabel {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final yesterday = today.subtract(const Duration(days: 1));
    final sevenDaysAgo = today.subtract(const Duration(days: 7));
    final thirtyDaysAgo = today.subtract(const Duration(days: 30));

    if (updatedAt.isAfter(today)) return 'Today';
    if (updatedAt.isAfter(yesterday)) return 'Yesterday';
    if (updatedAt.isAfter(sevenDaysAgo)) return 'Previous 7 Days';
    if (updatedAt.isAfter(thirtyDaysAgo)) return 'Previous 30 Days';
    return 'Older';
  }

  String get relativeTime {
    final diff = DateTime.now().difference(updatedAt);
    if (diff.inMinutes < 1) return 'Just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    if (diff.inDays < 7) return '${diff.inDays}d ago';
    return '${updatedAt.day}/${updatedAt.month}/${updatedAt.year}';
  }
}
