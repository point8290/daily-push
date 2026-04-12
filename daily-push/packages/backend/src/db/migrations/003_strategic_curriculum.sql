-- Replace default AI-only curriculum with strategic 2-month job-prep roadmap
-- Safe to re-run: clears and re-seeds

DELETE FROM daily_digests;
DELETE FROM study_sessions;
DELETE FROM study_items;
DELETE FROM topics;
ALTER TABLE topics AUTO_INCREMENT = 1;
ALTER TABLE study_items AUTO_INCREMENT = 1;

-- ─────────────────────────────────────────────
-- TOPIC 1: DSA for Senior Interviews (Weeks 1–3)
-- ─────────────────────────────────────────────
INSERT INTO topics (id, title, description, status, position) VALUES
(1, 'DSA for Senior Interviews',
 'Most companies — including mid-level product startups — require 2–3 DSA rounds for senior roles. Focus on patterns, not memorisation. NeetCode 150 is the benchmark. Target: solve 3–4 medium problems confidently within 30 min.',
 'active', 1);

INSERT INTO study_items (topic_id, title, description, resources, estimated_mins, position, status) VALUES

(1, 'Arrays & Hashing — the foundation of everything',
 'Master two-pointer, prefix sum, and hash map patterns. These appear in ~40% of all interview problems. Do 5 LeetCode problems: Two Sum, Group Anagrams, Top K Frequent Elements, Product of Array Except Self, Valid Anagram.',
 '[
   {"label":"NeetCode Arrays & Hashing","url":"https://www.youtube.com/@NeetCode","type":"video"},
   {"label":"NeetCode 150 Practice","url":"https://neetcode.io/practice","type":"docs"},
   {"label":"LeetCode Two Sum","url":"https://leetcode.com/problems/two-sum/","type":"docs"}
 ]',
 45, 1, 'current'),

(1, 'Sliding Window & Two Pointers',
 'Two of the most common interview patterns. Sliding window = subarray/substring problems. Two pointers = sorted array problems. Do: Longest Substring Without Repeating, Container With Most Water, 3Sum, Valid Palindrome.',
 '[
   {"label":"NeetCode Sliding Window Playlist","url":"https://www.youtube.com/@NeetCode","type":"video"},
   {"label":"NeetCode.io — Sliding Window problems","url":"https://neetcode.io/practice","type":"docs"}
 ]',
 40, 2, 'queued'),

(1, 'Binary Search — beyond the basics',
 'Binary search appears in non-obvious places. Learn: search in rotated sorted array, find minimum in rotated array, time-based key-value store. The pattern: when the search space is monotonic, use binary search.',
 '[
   {"label":"NeetCode Binary Search","url":"https://www.youtube.com/@NeetCode","type":"video"},
   {"label":"LeetCode Binary Search tag","url":"https://leetcode.com/tag/binary-search/","type":"docs"}
 ]',
 35, 3, 'queued'),

(1, 'Trees: BFS, DFS, and the 5 key patterns',
 'Trees appear in almost every interview. Master: inorder/preorder/postorder, level-order BFS, lowest common ancestor, serialize/deserialize. Do 6 problems from the NeetCode 150 tree section.',
 '[
   {"label":"NeetCode Trees Playlist","url":"https://www.youtube.com/@NeetCode","type":"video"},
   {"label":"Visualgo — Tree Traversals","url":"https://visualgo.net/en/bst","type":"docs"},
   {"label":"NeetCode 150 — Trees section","url":"https://neetcode.io/roadmap","type":"docs"}
 ]',
 50, 4, 'queued'),

(1, 'Graphs: BFS, DFS, Union Find',
 'Graphs are tested at senior level specifically. Key problems: number of islands, clone graph, course schedule (topological sort), Pacific Atlantic water flow. Understand adjacency lists and when to use BFS vs DFS.',
 '[
   {"label":"NeetCode Graphs Playlist","url":"https://www.youtube.com/@NeetCode","type":"video"},
   {"label":"Visualgo — Graph traversal","url":"https://visualgo.net/en/dfsbfs","type":"docs"}
 ]',
 50, 5, 'queued'),

(1, 'Dynamic Programming — the top 5 patterns',
 'DP is feared but patterned. Focus on: 1D DP (climbing stairs, house robber), 2D DP (unique paths, longest common subsequence), knapsack pattern. You do NOT need to solve hard DP — medium is enough for most companies.',
 '[
   {"label":"NeetCode DP Playlist","url":"https://www.youtube.com/@NeetCode","type":"video"},
   {"label":"DP Patterns — LeetCode Discuss","url":"https://leetcode.com/discuss/general-discussion/458695/dynamic-programming-patterns","type":"article"}
 ]',
 55, 6, 'queued'),

(1, 'Mock Coding Round — timed simulation',
 'Simulate a real interview: pick 2 unseen medium problems from NeetCode 150, set a 45-minute timer, no hints. After: review the solution, understand time/space complexity, practice explaining your approach aloud. This is the actual skill.',
 '[
   {"label":"NeetCode 150","url":"https://neetcode.io/practice","type":"docs"},
   {"label":"LeetCode Mock Interviews","url":"https://leetcode.com/interview/","type":"docs"}
 ]',
 60, 7, 'queued');


-- ─────────────────────────────────────────────
-- TOPIC 2: System Design for Senior Roles (Weeks 2–4)
-- ─────────────────────────────────────────────
INSERT INTO topics (id, title, description, status, position) VALUES
(2, 'System Design for Senior Roles',
 'System design is where senior engineers are made or broken. You already understand microservices, Docker, AWS, and MySQL — translate that into design interview fluency. Target: confidently design any system in 45 minutes with trade-offs.',
 'pending', 2);

INSERT INTO study_items (topic_id, title, description, resources, estimated_mins, position, status) VALUES

(2, 'The building blocks: what every system is made of',
 'Internalize the vocabulary: load balancers, CDN, caching (Redis/Memcached), message queues, databases (SQL vs NoSQL), API gateways. You will use these components in every design. Understand what each solves and when to reach for it.',
 '[
   {"label":"ByteByteGo — System Design Fundamentals","url":"https://www.youtube.com/@ByteByteGo","type":"video"},
   {"label":"Gaurav Sen — Intro to System Design","url":"https://www.youtube.com/@gkcs","type":"video"},
   {"label":"System Design Primer (GitHub)","url":"https://github.com/donnemartin/system-design-primer","type":"repo"}
 ]',
 45, 1, 'queued'),

(2, 'Databases deep dive: SQL, NoSQL, sharding, replication',
 'You know MySQL — now go deeper. When does sharding make sense? How does read replication work? Why does Instagram use Cassandra for feed but PostgreSQL for user data? This maps directly to your existing experience.',
 '[
   {"label":"ByteByteGo — How databases scale","url":"https://www.youtube.com/@ByteByteGo","type":"video"},
   {"label":"CMU Database Course (Free)","url":"https://15445.courses.cs.cmu.edu/fall2022/","type":"docs"},
   {"label":"Use The Index, Luke — SQL performance","url":"https://use-the-index-luke.com/","type":"docs"}
 ]',
 45, 2, 'queued'),

(2, 'Caching strategies: what to cache, where, and how long',
 'Caching is asked in virtually every system design interview. Learn: cache-aside vs write-through vs write-behind, cache invalidation strategies, Redis data structures, CDN caching. You improved API performance 30% at work — articulate the caching strategies behind that.',
 '[
   {"label":"ByteByteGo — Cache explained","url":"https://www.youtube.com/@ByteByteGo","type":"video"},
   {"label":"Redis University — Free course","url":"https://university.redis.com/","type":"docs"}
 ]',
 40, 3, 'queued'),

(2, 'Design a URL shortener — the warm-up classic',
 'This is the entry-level system design problem. Practice the full framework: clarify requirements → estimate scale → design API → design data model → draw architecture → discuss trade-offs. Time yourself to 35 minutes.',
 '[
   {"label":"ByteByteGo — URL shortener walkthrough","url":"https://www.youtube.com/@ByteByteGo","type":"video"},
   {"label":"System Design Primer — URL Shortener","url":"https://github.com/donnemartin/system-design-primer","type":"repo"}
 ]',
 45, 4, 'queued'),

(2, 'Design a real-time notification system (directly relevant to your work)',
 'Design a notification system like what you are building in Daily Push — email + push delivery, scheduling, retry logic. This maps to your actual experience. Topics: fan-out vs fan-in, message queues (SQS/Kafka), idempotency, delivery guarantees.',
 '[
   {"label":"Gaurav Sen — Notification system design","url":"https://www.youtube.com/@gkcs","type":"video"},
   {"label":"ByteByteGo — Design a notification system","url":"https://www.youtube.com/@ByteByteGo","type":"video"}
 ]',
 50, 5, 'queued'),

(2, 'Design a social feed or content ranking system',
 'Common at product companies (Zomato, Swiggy, Flipkart, Razorpay, etc). Covers: write amplification vs read amplification trade-off, timeline aggregation, ranking algorithms, eventual consistency. This is senior-level differentiation.',
 '[
   {"label":"Gaurav Sen — Design Instagram","url":"https://www.youtube.com/@gkcs","type":"video"},
   {"label":"ByteByteGo — Design a news feed","url":"https://www.youtube.com/@ByteByteGo","type":"video"},
   {"label":"High Scalability blog","url":"http://highscalability.com/","type":"article"}
 ]',
 50, 6, 'queued'),

(2, 'Mock system design interview — full 45-minute simulation',
 'Pick a system you have NOT studied: design WhatsApp, design Uber, or design Google Docs. Set a 45-minute timer. Use pen/paper or Excalidraw. After: watch the ByteByteGo video for the same system and identify what you missed. Repeat until you cover all trade-offs naturally.',
 '[
   {"label":"Excalidraw — free whiteboard","url":"https://excalidraw.com/","type":"docs"},
   {"label":"ByteByteGo — System Design Interview Vol 1","url":"https://www.youtube.com/@ByteByteGo","type":"video"},
   {"label":"Pramp — free mock interviews","url":"https://www.pramp.com/","type":"docs"}
 ]',
 60, 7, 'queued');


-- ─────────────────────────────────────────────
-- TOPIC 3: LLM API & AI Integration (Weeks 1–3, parallel)
-- ─────────────────────────────────────────────
INSERT INTO topics (id, title, description, status, position) VALUES
(3, 'LLM API & AI Integration',
 'The market differentiator right now. Full-stack devs who can ship AI features are in extreme demand. You are already building with this in Daily Push — formalise the knowledge so you can speak confidently about it in interviews.',
 'pending', 3);

INSERT INTO study_items (topic_id, title, description, resources, estimated_mins, position, status) VALUES

(3, 'Claude API fundamentals + your first completion',
 'Set up the Anthropic SDK in Node.js/TypeScript. Understand the Messages API structure: system vs user vs assistant roles, max_tokens, temperature. You are already using this in Daily Push — read the official docs to fill in the gaps.',
 '[
   {"label":"Anthropic Quickstart Guide","url":"https://docs.anthropic.com/en/docs/quickstart","type":"docs"},
   {"label":"Messages API Reference","url":"https://docs.anthropic.com/en/api/messages","type":"docs"},
   {"label":"Fireship — AI APIs explained","url":"https://www.youtube.com/@Fireship","type":"video"}
 ]',
 25, 1, 'queued'),

(3, 'Prompt engineering patterns that actually work',
 'Learn the patterns that make AI reliable in production: zero-shot, few-shot, chain-of-thought, XML tagging for structured prompts, role assignment. These are the techniques you are using in Daily Push — understand the why behind each.',
 '[
   {"label":"Anthropic Prompt Engineering Guide","url":"https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/overview","type":"docs"},
   {"label":"Anthropic Prompt Library","url":"https://docs.anthropic.com/en/prompt-library/library","type":"docs"}
 ]',
 30, 2, 'queued'),

(3, 'Tool use / function calling — foundation of AI agents',
 'Claude tool use lets you define functions with JSON schemas that Claude decides to call. This is how you build agents. Master: defining tool schemas, handling tool_use response blocks, returning tool results, multi-turn tool loops.',
 '[
   {"label":"Anthropic Tool Use Docs","url":"https://docs.anthropic.com/en/docs/build-with-claude/tool-use","type":"docs"},
   {"label":"Tool Use Cookbook","url":"https://github.com/anthropics/anthropic-cookbook/tree/main/tool_use","type":"repo"}
 ]',
 35, 3, 'queued'),

(3, 'Streaming with SSE — making AI feel instant',
 'Streaming is non-negotiable for good UX. Learn: how to use the Anthropic streaming API, piping streams through Express with SSE headers, consuming the stream on the React frontend with EventSource or fetch ReadableStream.',
 '[
   {"label":"Anthropic Streaming Docs","url":"https://docs.anthropic.com/en/api/messages-streaming","type":"docs"},
   {"label":"MDN — Server-Sent Events","url":"https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events","type":"docs"}
 ]',
 30, 4, 'queued'),

(3, 'Prompt caching + cost optimisation',
 'Anthropic prompt caching reduces costs by up to 90% on repeated system prompts. Critical for production apps. You already use this in Daily Push — understand the mechanics: cache_control headers, 5-minute TTL, what gets cached.',
 '[
   {"label":"Anthropic Prompt Caching Docs","url":"https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching","type":"docs"}
 ]',
 25, 5, 'queued');


-- ─────────────────────────────────────────────
-- TOPIC 4: RAG Systems (Weeks 3–5)
-- ─────────────────────────────────────────────
INSERT INTO topics (id, title, description, status, position) VALUES
(4, 'RAG Systems',
 'Retrieval Augmented Generation is the dominant pattern for production AI apps. Pair vector search with LLMs to build knowledge-aware features. This is what separates "I can call an API" from "I can architect AI systems".',
 'pending', 4);

INSERT INTO study_items (topic_id, title, description, resources, estimated_mins, position, status) VALUES

(4, 'Embeddings — intuition first, math second',
 'Embeddings convert text into vectors where semantic similarity = geometric proximity. You do not need to understand the math to use them effectively. Focus on: what they are, how to generate them (API call), and how cosine similarity works for search.',
 '[
   {"label":"Simon Willison — What are Embeddings?","url":"https://simonwillison.net/2023/Oct/23/embeddings/","type":"article"},
   {"label":"3Blue1Brown — Vectors (visual intuition)","url":"https://www.youtube.com/@3blue1brown","type":"video"}
 ]',
 20, 1, 'queued'),

(4, 'pgvector — vector search with SQL you already know',
 'pgvector adds a vector column type and similarity operators to PostgreSQL. Install the extension, create an embeddings table, add an HNSW index, and write a similarity search query. This maps directly to your existing SQL skills.',
 '[
   {"label":"pgvector GitHub README","url":"https://github.com/pgvector/pgvector","type":"repo"},
   {"label":"Supabase Vector Guide","url":"https://supabase.com/docs/guides/ai/vector-columns","type":"docs"}
 ]',
 30, 2, 'queued'),

(4, 'Document chunking strategies',
 'How you chunk documents determines RAG quality. Compare: fixed-size, sentence-boundary, and semantic chunking. Understand overlap, chunk metadata, and the chunk-size vs retrieval precision trade-off. This is where most RAG systems fail.',
 '[
   {"label":"Pinecone — Chunking Strategies Guide","url":"https://www.pinecone.io/learn/chunking-strategies/","type":"article"}
 ]',
 25, 3, 'queued'),

(4, 'Build a RAG pipeline end-to-end in Node.js',
 'Build the full loop: ingest documents → chunk → embed (Anthropic API) → store in pgvector → on query: embed the query → retrieve top-K chunks → pass chunks + query to Claude → return answer. Wire it up from scratch in TypeScript.',
 '[
   {"label":"Anthropic Cookbook — RAG","url":"https://github.com/anthropics/anthropic-cookbook/tree/main/skills/retrieval_augmented_generation","type":"repo"},
   {"label":"Anthropic Contextual Retrieval","url":"https://www.anthropic.com/news/contextual-retrieval","type":"article"}
 ]',
 50, 4, 'queued'),

(4, 'Evaluating RAG: is it actually working?',
 'Build a simple eval loop: pick 10 test questions with known answers, run your RAG pipeline, score with LLM-as-judge. Learn retrieval precision and answer faithfulness metrics. This is what separates demos from production systems.',
 '[
   {"label":"Anthropic Evals Guide","url":"https://docs.anthropic.com/en/docs/test-and-evaluate/evals/overview","type":"docs"},
   {"label":"RAGAS — RAG evaluation framework","url":"https://docs.ragas.io/","type":"docs"}
 ]',
 30, 5, 'queued');


-- ─────────────────────────────────────────────
-- TOPIC 5: Node.js & TypeScript Mastery (Weeks 4–5)
-- ─────────────────────────────────────────────
INSERT INTO topics (id, title, description, status, position) VALUES
(5, 'Node.js & TypeScript Mastery',
 'You use Node.js daily but may have gaps in the internals that senior-level technical screens expose. Filling these gaps lets you answer "how does X work under the hood" with authority — and it makes your code better.',
 'pending', 5);

INSERT INTO study_items (topic_id, title, description, resources, estimated_mins, position, status) VALUES

(5, 'The Node.js event loop — not just "non-blocking"',
 'Most devs know Node is non-blocking but cannot explain why. Learn: call stack, event loop phases (timers, I/O, check), microtask queue (Promises vs process.nextTick), and libuv. Understand what actually blocks the event loop and how to avoid it.',
 '[
   {"label":"Node.js Docs — Event Loop","url":"https://nodejs.org/en/docs/guides/event-loop-timers-and-nexttick","type":"docs"},
   {"label":"Philip Roberts — What is the Event Loop? (JSConf)","url":"https://www.youtube.com/watch?v=8aGhZQkoFbQ","type":"video"}
 ]',
 35, 1, 'queued'),

(5, 'TypeScript: generics, utility types, and advanced patterns',
 'Senior TS roles expect fluency with generics, conditional types, mapped types, and template literal types. Learn: Partial, Required, Pick, Omit, Record, ReturnType, Parameters. Practice writing generic utility functions.',
 '[
   {"label":"Matt Pocock — TypeScript Wizardry","url":"https://www.youtube.com/@mattpocockuk","type":"video"},
   {"label":"TypeScript Handbook — Generics","url":"https://www.typescriptlang.org/docs/handbook/2/generics.html","type":"docs"},
   {"label":"Type Challenges","url":"https://github.com/type-challenges/type-challenges","type":"repo"}
 ]',
 40, 2, 'queued'),

(5, 'Node.js performance: profiling, clustering, worker threads',
 'When does Node become a bottleneck? Learn: CPU profiling with --prof, cluster module for multi-core, worker_threads for CPU-intensive tasks, and stream pipelines for memory efficiency. Maps to your IoT system work at AgNext.',
 '[
   {"label":"Node.js Docs — Cluster","url":"https://nodejs.org/api/cluster.html","type":"docs"},
   {"label":"Node.js Docs — Worker Threads","url":"https://nodejs.org/api/worker_threads.html","type":"docs"}
 ]',
 35, 3, 'queued'),

(5, 'Testing Node.js APIs with Jest — what to actually test',
 'You list Jest on your resume. Demonstrate mastery: unit tests, integration tests hitting a real DB (not mocked), supertest for HTTP layer, test factories for fixtures. Understand what mock and what not to mock.',
 '[
   {"label":"Jest Docs","url":"https://jestjs.io/docs/getting-started","type":"docs"},
   {"label":"Supertest GitHub","url":"https://github.com/ladjs/supertest","type":"repo"}
 ]',
 30, 4, 'queued');


-- ─────────────────────────────────────────────
-- TOPIC 6: Interview Preparation & Job Hunt (Weeks 6–8)
-- ─────────────────────────────────────────────
INSERT INTO topics (id, title, description, status, position) VALUES
(6, 'Interview Preparation & Job Hunt',
 'The last mile. Technical skills are table stakes — winning offers requires communicating your value clearly, negotiating well, and positioning yourself as an AI-aware senior engineer in a market that is hungry for them.',
 'pending', 6);

INSERT INTO study_items (topic_id, title, description, resources, estimated_mins, position, status) VALUES

(6, 'Build your AI engineer narrative from your resume',
 'You have the skills but you need the story. Write 3 versions of your intro: one for product startups, one for AI-first companies, one for enterprise. For each: lead with impact, mention AI awareness, reference specific systems you built. This Daily Push project is part of your portfolio now.',
 '[
   {"label":"Lenny Rachitsky — How to get a job in tech","url":"https://www.lennysnewsletter.com/","type":"article"},
   {"label":"levels.fyi — understand compensation bands","url":"https://www.levels.fyi/","type":"docs"}
 ]',
 30, 1, 'queued'),

(6, 'Behavioral questions: STAR format for senior roles',
 'Senior roles ask deeper behavioral questions: "Tell me about a time you disagreed with your manager", "How did you influence a technical decision without authority?", "What is the hardest technical problem you have solved?" Prepare 8 STAR stories from your AgNext and Metacube experience.',
 '[
   {"label":"STAR Method Guide","url":"https://www.themuse.com/advice/star-interview-method","type":"article"}
 ]',
 35, 2, 'queued'),

(6, 'LinkedIn optimisation + inbound sourcing',
 'Update your LinkedIn: add "AI Engineering" and "LLM Integration" to your skills, write a headline that includes AI keywords, add Daily Push to your projects section. Turn on Open to Work for recruiters only. Aim for 3–5 inbound recruiter messages per week.',
 '[
   {"label":"LinkedIn Profile Checklist","url":"https://www.linkedin.com/help/linkedin/answer/a549765","type":"docs"}
 ]',
 25, 3, 'queued'),

(6, 'Offer negotiation — how to get the maximum',
 'Never accept the first number. Learn: how to delay giving a number, how to use competing offers (real or implied), how to negotiate equity vs cash, and how to handle exploding offers. One negotiation conversation can be worth months of salary.',
 '[
   {"label":"Haseeb Qureshi — Ten Rules for Negotiating","url":"https://haseebq.com/my-ten-rules-for-negotiating-a-job-offer/","type":"article"},
   {"label":"Levels.fyi Salary Data","url":"https://www.levels.fyi/","type":"docs"}
 ]',
 25, 4, 'queued'),

(6, 'Full mock interview: coding + system design back-to-back',
 'Simulate a real interview loop: 45 min DSA (2 medium problems) + 45 min system design (design a system you have not prepared). Use Pramp for a real partner or record yourself. Review the recording — your verbal explanation is half the score.',
 '[
   {"label":"Pramp — Free mock interviews","url":"https://www.pramp.com/","type":"docs"},
   {"label":"interviewing.io — anonymous mock interviews","url":"https://interviewing.io/","type":"docs"}
 ]',
 90, 5, 'queued');


-- Update news interests to include job-search signal
DELETE FROM news_interests;
INSERT INTO news_interests (tag) VALUES
('llm'), ('ai-engineering'), ('nodejs'), ('typescript'), ('system-design'),
('software-engineering'), ('interview'), ('react'), ('aws'), ('open-source');
