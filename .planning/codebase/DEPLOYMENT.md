# Dexter AI Chatbot — Deployment Guide

## ⚠️ Important Note: Local vs Cloud
Right now, this codebase uses **Ollama** running locally on your computer at `http://localhost:11434` for generating embeddings. 

**Vercel cannot connect to your local Ollama instance.** If you deploy this to Vercel exactly as-is, the chat will fail to retrieve knowledge base articles because it can't reach localhost.

Before you can have a fully working production app on Vercel, you will need to swap `OllamaEmbeddings` for a cloud provider (like OpenAI, HuggingFace, or Sarvam if they offer embeddings) in `route.ts`. 

## 1. Push to GitHub
Your code is committed locally. Push it to your GitHub repo:
```bash
git remote add origin https://github.com/Itinerant18/Dexter-bot.git
git branch -M main
git push -u origin main
```

## 2. Deploy to Vercel
1. Go to [Vercel](https://vercel.com/) and click **Add New → Project**.
2. Import the `Itinerant18/Dexter-bot` repository.
3. Add the following **Environment Variables**:
   - `NEXT_PUBLIC_SUPABASE_URL` 
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SARVAM_API_KEY`
   - `NEXT_PUBLIC_ADMIN_PASSWORD` (Set this to whatever password you want for the admin dashboard)
4. Click **Deploy**.

## 3. Post-Deployment
- The free Vercel tier has a **10-second timeout** limit for Edge/Serverless functions. 
- Using Sarvam AI + Supabase usually completes within 4-6 seconds, which fits the limit, but if the LLM provider takes too long, you might see function timeout errors on Vercel's free tier. 
