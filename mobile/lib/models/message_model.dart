enum MessageRole { user, assistant, system }

class DiagramData {
  final String markdown;
  final String title;
  final String diagramType;
  final String panelType;
  final bool hasKBContext;

  DiagramData({
    required this.markdown,
    required this.title,
    required this.diagramType,
    required this.panelType,
    this.hasKBContext = false,
  });

  factory DiagramData.fromJson(Map<String, dynamic> json) {
    return DiagramData(
      markdown: json['markdown'] as String? ?? '',
      title: json['title'] as String? ?? '',
      diagramType: json['diagramType'] as String? ?? '',
      panelType: json['panelType'] as String? ?? '',
      hasKBContext: json['hasKBContext'] as bool? ?? false,
    );
  }
}

class ChatMessage {
  final String id;
  final MessageRole role;
  final String content;
  final DateTime createdAt;
  final DiagramData? diagram;
  final int? feedbackRating;

  ChatMessage({
    required this.id,
    required this.role,
    required this.content,
    DateTime? createdAt,
    this.diagram,
    this.feedbackRating,
  }) : createdAt = createdAt ?? DateTime.now();

  factory ChatMessage.user(String content) {
    return ChatMessage(
      id: DateTime.now().millisecondsSinceEpoch.toString(),
      role: MessageRole.user,
      content: content,
    );
  }

  factory ChatMessage.assistant(String content) {
    return ChatMessage(
      id: DateTime.now().millisecondsSinceEpoch.toString(),
      role: MessageRole.assistant,
      content: content,
    );
  }

  factory ChatMessage.diagram(DiagramData data) {
    return ChatMessage(
      id: DateTime.now().millisecondsSinceEpoch.toString(),
      role: MessageRole.assistant,
      content: data.title,
      diagram: data,
    );
  }

  factory ChatMessage.fromJson(Map<String, dynamic> json) {
    return ChatMessage(
      id: json['id'] as String? ?? DateTime.now().millisecondsSinceEpoch.toString(),
      role: json['role'] == 'user' ? MessageRole.user : MessageRole.assistant,
      content: json['content'] as String? ?? '',
      createdAt: json['created_at'] != null
          ? DateTime.parse(json['created_at'] as String)
          : DateTime.now(),
    );
  }

  Map<String, dynamic> toApiJson() => {
        'role': role == MessageRole.user ? 'user' : 'assistant',
        'content': content,
      };

  ChatMessage copyWith({int? feedbackRating}) {
    return ChatMessage(
      id: id,
      role: role,
      content: content,
      createdAt: createdAt,
      diagram: diagram,
      feedbackRating: feedbackRating ?? this.feedbackRating,
    );
  }
}
