
# 📐 Current Plan
> Paste the plan from Claude.ai here before executing with other tools.
> Claude Code will read this for context during validation.

---

## Task
Refactor and upgrade the chatbot system in `Swacth360_bot` to fix:

- Poor answer quality (unclear, unstructured responses)
- Weak retrieval accuracy (irrelevant or noisy context)
- Slow and inconsistent response time
- Lack of conversational intelligence (no intent detection, no memory)
- Missing response formatting layer

Transform the bot from a **data retrieval system** into a **structured AI assistant** that produces clear, user-friendly, and context-aware responses.

---

## Stack Context
- Framework: Next.js 16 + React 19 + TypeScript
- LLM: Sarvam-M via sarvam.ai
- DB: Supabase (pgvector)
- Cache: Upstash Redis
- Vector: Pinecone

---

## Plan Steps

### 1. Enforce Strict Request Pipeline (CRITICAL)
Refactor chatbot API to enforce:

User Query  
→ Query Processor  
→ Intent Classifier  
→ Retrieval Optimizer (RAG)  
→ LLM Answer Generation  
→ Response Formatter  
→ Confidence Check  
→ Cache  
→ Final Response  

Rules:
- No direct retrieval → response allowed
- All outputs MUST pass through formatter

---

### 2. Build Query Processing Layer
Create: `src/lib/queryProcessor.ts`

Responsibilities:
- Normalize input (lowercase, trim, remove noise)
- Rewrite queries for better semantic meaning

Examples:
- "wifi not working" → "How to fix WiFi connectivity issues?"
- "device offline why" → "Why is my device offline and how to fix it?"

---

### 3. Implement Intent Classification
Create: `src/lib/intentClassifier.ts`

Classify into:
- informational
- troubleshooting
- action
- casual

Output:
```json
{
  "intent": "troubleshooting",
  "confidence": 0.87
}
````

Use:

* rule-based logic (primary)
* optional LLM fallback

---

### 4. Upgrade Retrieval System (RAG)

Create: `src/lib/retrievalOptimizer.ts`

Fix:

* Limit top-k results (3–5)
* Remove duplicate chunks
* Rank by semantic relevance

Add:

* context cleaning
* chunk merging

Goal:

* Pass only high-quality context to LLM

---

### 5. Add Response Formatter (MOST IMPORTANT)

Create: `src/lib/responseFormatter.ts`

Function:

```
formatResponse(rawAnswer, intent)
```

For troubleshooting:

* ✅ Short Answer
* 📖 Explanation
* 🛠 Step-by-step Fix
* ⚠ Notes

For informational:

* ✅ Short Answer
* 📖 Explanation
* 📌 Key Points

Rules:

* Use simple language
* Avoid jargon
* Break long paragraphs

---

### 6. Add Confidence Scoring + Fallback

Logic:

* Use retrieval score + context quality

If low confidence:

```
"I might not have the exact answer, but here’s the closest information available..."
```

Rule:

* Never return confidently wrong answers

---

### 7. Implement Lightweight Memory

Create: `src/lib/memory.ts`

* Store last 2–3 queries
* Enable follow-up understanding

Example:
"device offline" → "how to fix it"

---

### 8. Improve Caching Strategy

Update: `src/lib/cache.ts`

* Cache ONLY final formatted responses
* Use normalized query as key
* Add TTL (5–15 mins)

---

### 9. Optimize Performance

* Make retrieval async
* Reduce redundant DB/vector calls
* Avoid multiple LLM calls

Target:

* Response time < 1.5s

---

### 10. Improve Data Quality

Update ingestion:

* Remove duplicates
* Clean noisy data
* Ensure readable content
* Fix broken chunks

---

### 11. Fix Intelligent Routing Integration

Update `.agent/skills/intelligent-routing`

* Ensure routing is part of main pipeline
* Use routing to influence:

  * retrieval
  * formatting

---

### 12. Add Debug Logging (Optional but Recommended)

Log:

* user query
* intent
* retrieved chunks
* final response

---

## Files to Touch

### Core API

* `src/app/api/.../route.ts`

---

### New Files

* `src/lib/queryProcessor.ts`
* `src/lib/intentClassifier.ts`
* `src/lib/retrievalOptimizer.ts`
* `src/lib/responseFormatter.ts`
* `src/lib/memory.ts`

---

### Existing Files (Modify Carefully)

* `src/lib/cache.ts`
* `scripts/langextract-ingest.py`
* `.agent/skills/intelligent-routing/*`

---

## Expected Outcome

### Answer Quality

* Clear, structured, easy-to-understand responses
* No raw or confusing outputs

---

### Retrieval Accuracy

* Relevant and clean context only
* Reduced hallucinations

---

### Performance

* Faster responses
* Efficient caching

---

### Conversational Intelligence

* Understands follow-up queries
* Adapts response style based on intent

---

### Reliability

* No misleading answers
* Proper fallback when uncertain

---

## Final Result

Before:

> Chatbot behaves like a search engine with inconsistent output

After:

> Chatbot behaves like a structured AI assistant that explains clearly like a human expert

```

