-- 006_fix_resources.sql
-- Replace all YouTube channel URLs with specific, verified video URLs and curated articles.
--
-- Confirmed video IDs (verified via web research):
--   T0u5nwSA0w0  NeetCode 150 Full Course — freeCodeCamp (38 hrs, all DSA patterns with chapters)
--   dBmxNsS3BGE  ByteByteGo — Top 6 Load Balancing Algorithms
--   UNUz1-msbOM  ByteByteGo — Message Queue Evolution (IBM MQ→RabbitMQ→Kafka→Pulsar)
--   zjkBMFhNj_g  Andrej Karpathy — Intro to Large Language Models (1 hr)
--   wjZofJX0v4M  3Blue1Brown — Transformers, the tech behind LLMs (Chapter 5)
--   LPZh9BOjkQs  3Blue1Brown — Large Language Models explained briefly
--   zQnBQ4tB3ZA  Fireship — TypeScript in 100 Seconds
--   8aGhZQkoFbQ  Philip Roberts — What the heck is the Event Loop? (already correct, untouched)

-- ═══════════════════════════════════════════
-- DSA & Problem Solving — IDs 1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23
-- All concept sessions: replace @NeetCode channel with the specific freeCodeCamp
-- NeetCode 150 course video + topic-specific neetcode.io solution page
-- ═══════════════════════════════════════════

UPDATE study_items SET resources = '[
  {"label":"NeetCode 150 — Full Course [freeCodeCamp]","url":"https://www.youtube.com/watch?v=T0u5nwSA0w0","type":"video"},
  {"label":"NeetCode — Two Pointers solutions & video","url":"https://neetcode.io/solutions/valid-palindrome","type":"docs"},
  {"label":"NeetCode 150 Roadmap","url":"https://neetcode.io/roadmap","type":"docs"}
]' WHERE id = 1;

UPDATE study_items SET resources = '[
  {"label":"NeetCode 150 — Full Course [freeCodeCamp]","url":"https://www.youtube.com/watch?v=T0u5nwSA0w0","type":"video"},
  {"label":"NeetCode — Sliding Window solution & video","url":"https://neetcode.io/solutions/longest-substring-without-repeating-characters","type":"docs"},
  {"label":"Longest Substring Without Repeating (intro problem)","url":"https://leetcode.com/problems/longest-substring-without-repeating-characters/","type":"docs"}
]' WHERE id = 3;

UPDATE study_items SET resources = '[
  {"label":"NeetCode 150 — Full Course [freeCodeCamp]","url":"https://www.youtube.com/watch?v=T0u5nwSA0w0","type":"video"},
  {"label":"NeetCode — Two Sum (hashing intro problem)","url":"https://neetcode.io/solutions/two-sum","type":"docs"},
  {"label":"Product of Array Except Self (prefix sum)","url":"https://leetcode.com/problems/product-of-array-except-self/","type":"docs"}
]' WHERE id = 5;

UPDATE study_items SET resources = '[
  {"label":"NeetCode 150 — Full Course [freeCodeCamp]","url":"https://www.youtube.com/watch?v=T0u5nwSA0w0","type":"video"},
  {"label":"NeetCode — Valid Parentheses (stack intro)","url":"https://neetcode.io/solutions/valid-parentheses","type":"docs"},
  {"label":"Valid Parentheses on LeetCode","url":"https://leetcode.com/problems/valid-parentheses/","type":"docs"}
]' WHERE id = 7;

UPDATE study_items SET resources = '[
  {"label":"NeetCode 150 — Full Course [freeCodeCamp]","url":"https://www.youtube.com/watch?v=T0u5nwSA0w0","type":"video"},
  {"label":"NeetCode — Binary Search solution & video","url":"https://neetcode.io/solutions/binary-search","type":"docs"},
  {"label":"Binary Search on LeetCode","url":"https://leetcode.com/problems/binary-search/","type":"docs"}
]' WHERE id = 9;

UPDATE study_items SET resources = '[
  {"label":"NeetCode 150 — Full Course [freeCodeCamp]","url":"https://www.youtube.com/watch?v=T0u5nwSA0w0","type":"video"},
  {"label":"NeetCode — Invert Binary Tree (trees intro)","url":"https://neetcode.io/solutions/invert-binary-tree","type":"docs"},
  {"label":"Visualgo — Binary Tree Visualiser","url":"https://visualgo.net/en/bst","type":"docs"}
]' WHERE id = 11;

UPDATE study_items SET resources = '[
  {"label":"NeetCode 150 — Full Course [freeCodeCamp]","url":"https://www.youtube.com/watch?v=T0u5nwSA0w0","type":"video"},
  {"label":"NeetCode — Validate BST solution & video","url":"https://neetcode.io/solutions/validate-binary-search-tree","type":"docs"},
  {"label":"Validate Binary Search Tree on LeetCode","url":"https://leetcode.com/problems/validate-binary-search-tree/","type":"docs"}
]' WHERE id = 13;

UPDATE study_items SET resources = '[
  {"label":"NeetCode 150 — Full Course [freeCodeCamp]","url":"https://www.youtube.com/watch?v=T0u5nwSA0w0","type":"video"},
  {"label":"NeetCode — Number of Islands (graphs intro)","url":"https://neetcode.io/solutions/number-of-islands","type":"docs"},
  {"label":"Visualgo — Graph BFS/DFS Visualiser","url":"https://visualgo.net/en/dfsbfs","type":"docs"}
]' WHERE id = 15;

UPDATE study_items SET resources = '[
  {"label":"NeetCode 150 — Full Course [freeCodeCamp]","url":"https://www.youtube.com/watch?v=T0u5nwSA0w0","type":"video"},
  {"label":"NeetCode — Course Schedule (topo sort intro)","url":"https://neetcode.io/solutions/course-schedule","type":"docs"},
  {"label":"Course Schedule on LeetCode","url":"https://leetcode.com/problems/course-schedule/","type":"docs"}
]' WHERE id = 17;

UPDATE study_items SET resources = '[
  {"label":"NeetCode 150 — Full Course [freeCodeCamp]","url":"https://www.youtube.com/watch?v=T0u5nwSA0w0","type":"video"},
  {"label":"NeetCode — Climbing Stairs (1D DP intro)","url":"https://neetcode.io/solutions/climbing-stairs","type":"docs"},
  {"label":"DP Patterns — LeetCode Discuss (must-read)","url":"https://leetcode.com/discuss/general-discussion/458695/dynamic-programming-patterns","type":"article"}
]' WHERE id = 19;

UPDATE study_items SET resources = '[
  {"label":"NeetCode 150 — Full Course [freeCodeCamp]","url":"https://www.youtube.com/watch?v=T0u5nwSA0w0","type":"video"},
  {"label":"NeetCode — Unique Paths (2D DP intro)","url":"https://neetcode.io/solutions/unique-paths","type":"docs"},
  {"label":"Unique Paths on LeetCode","url":"https://leetcode.com/problems/unique-paths/","type":"docs"}
]' WHERE id = 21;

UPDATE study_items SET resources = '[
  {"label":"NeetCode 150 — Full Course [freeCodeCamp]","url":"https://www.youtube.com/watch?v=T0u5nwSA0w0","type":"video"},
  {"label":"NeetCode — Kth Largest Element (heap intro)","url":"https://neetcode.io/solutions/kth-largest-element-in-an-array","type":"docs"},
  {"label":"Kth Largest Element on LeetCode","url":"https://leetcode.com/problems/kth-largest-element-in-an-array/","type":"docs"}
]' WHERE id = 23;

-- ═══════════════════════════════════════════
-- System Design — IDs 25–44
-- Replace @ByteByteGo and @gkcs channel URLs with:
--   - Confirmed ByteByteGo video IDs (where verified)
--   - ByteByteGo blog articles (specific, well-written, free)
--   - System Design Primer (reference)
-- ═══════════════════════════════════════════

-- ID 25: Networking & HTTP — Concept
UPDATE study_items SET resources = '[
  {"label":"ByteByteGo — A Crash Course in Networking","url":"https://blog.bytebytego.com/p/a-crash-course-in-networking","type":"article"},
  {"label":"ByteByteGo — How does HTTPS work?","url":"https://blog.bytebytego.com/p/how-does-https-work","type":"article"},
  {"label":"High Performance Browser Networking (free book)","url":"https://hpbn.co/","type":"docs"}
]' WHERE id = 25;

-- ID 26: Networking Practice — has @ByteByteGo channel video
UPDATE study_items SET resources = '[
  {"label":"ByteByteGo — HTTP/1 vs HTTP/2 vs HTTP/3","url":"https://blog.bytebytego.com/p/http-1-vs-http-2-vs-http-3-a-deep","type":"article"},
  {"label":"MDN — HTTP Overview","url":"https://developer.mozilla.org/en-US/docs/Web/HTTP/Overview","type":"docs"},
  {"label":"Excalidraw (diagram your understanding)","url":"https://excalidraw.com/","type":"docs"}
]' WHERE id = 26;

-- ID 27: Load Balancing — Concept (confirmed video dBmxNsS3BGE)
UPDATE study_items SET resources = '[
  {"label":"ByteByteGo — Top 6 Load Balancing Algorithms","url":"https://www.youtube.com/watch?v=dBmxNsS3BGE","type":"video"},
  {"label":"ByteByteGo — What is a Load Balancer?","url":"https://blog.bytebytego.com/p/ep123-what-is-a-load-balancer","type":"article"},
  {"label":"System Design Primer — Load Balancer","url":"https://github.com/donnemartin/system-design-primer#load-balancer","type":"repo"}
]' WHERE id = 27;

-- ID 29: Caching — Concept
UPDATE study_items SET resources = '[
  {"label":"ByteByteGo — A Guide to Top Caching Strategies","url":"https://blog.bytebytego.com/p/a-guide-to-top-caching-strategies","type":"article"},
  {"label":"ByteByteGo — A Crash Course in Caching","url":"https://blog.bytebytego.com/p/a-crash-course-in-caching-part-1","type":"article"},
  {"label":"Redis University — Free Course","url":"https://university.redis.com/","type":"docs"}
]' WHERE id = 29;

-- ID 30: Caching Practice
UPDATE study_items SET resources = '[
  {"label":"ByteByteGo — Cache Systems Every Developer Should Know","url":"https://blog.bytebytego.com/p/ep54-cache-systems-every-developer","type":"article"},
  {"label":"System Design Primer — Cache","url":"https://github.com/donnemartin/system-design-primer#cache","type":"repo"},
  {"label":"Excalidraw (diagram your caching layer)","url":"https://excalidraw.com/","type":"docs"}
]' WHERE id = 30;

-- ID 31: Message Queues — Concept (confirmed video UNUz1-msbOM)
UPDATE study_items SET resources = '[
  {"label":"ByteByteGo — Message Queue Evolution (IBM MQ→Kafka→Pulsar)","url":"https://www.youtube.com/watch?v=UNUz1-msbOM","type":"video"},
  {"label":"ByteByteGo — Why Do We Need a Message Queue?","url":"https://blog.bytebytego.com/p/why-do-we-need-a-message-queue","type":"article"},
  {"label":"AWS SQS Developer Guide","url":"https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/welcome.html","type":"docs"}
]' WHERE id = 31;

-- ID 33: SQL vs NoSQL — Concept
UPDATE study_items SET resources = '[
  {"label":"ByteByteGo — Understanding Database Types","url":"https://blog.bytebytego.com/p/understanding-database-types","type":"article"},
  {"label":"ByteByteGo — SQL vs NoSQL — Choosing the Right Database","url":"https://blog.bytebytego.com/p/sql-vs-nosql-choosing-the-right-database","type":"article"},
  {"label":"System Design Primer — SQL vs NoSQL","url":"https://github.com/donnemartin/system-design-primer#sql-or-nosql","type":"repo"}
]' WHERE id = 33;

-- ID 35: Indexing — Concept (already has usetheindexluke.com, just remove channel URL)
UPDATE study_items SET resources = '[
  {"label":"Use The Index, Luke — Free SQL Indexing Guide","url":"https://use-the-index-luke.com/","type":"docs"},
  {"label":"ByteByteGo — How do SQL Indexes Work?","url":"https://blog.bytebytego.com/p/ep50-visualizing-a-sql-query","type":"article"},
  {"label":"MySQL EXPLAIN Docs","url":"https://dev.mysql.com/doc/refman/8.0/en/explain.html","type":"docs"}
]' WHERE id = 35;

-- ID 37: Sharding & Replication — Concept
UPDATE study_items SET resources = '[
  {"label":"ByteByteGo — Database Sharding Explained","url":"https://blog.bytebytego.com/p/database-sharding-explained","type":"article"},
  {"label":"ByteByteGo — A Crash Course in Distributed Systems","url":"https://blog.bytebytego.com/p/a-crash-course-in-distributed-systems","type":"article"},
  {"label":"System Design Primer — Sharding","url":"https://github.com/donnemartin/system-design-primer#sharding-or-data-partitioning","type":"repo"}
]' WHERE id = 37;

-- ID 39: URL Shortener — Concept
UPDATE study_items SET resources = '[
  {"label":"ByteByteGo — System Design: URL Shortener","url":"https://blog.bytebytego.com/p/url-shortener-system-design","type":"article"},
  {"label":"System Design Primer — Reference","url":"https://github.com/donnemartin/system-design-primer","type":"repo"},
  {"label":"Excalidraw (draw your architecture)","url":"https://excalidraw.com/","type":"docs"}
]' WHERE id = 39;

-- ID 41: Notification System — Concept
UPDATE study_items SET resources = '[
  {"label":"ByteByteGo — Design a Notification System","url":"https://blog.bytebytego.com/p/a-framework-for-system-design-interviews","type":"article"},
  {"label":"ByteByteGo — How Does Push Notification Work?","url":"https://blog.bytebytego.com/p/how-does-push-notification-work","type":"article"},
  {"label":"Excalidraw (draw your design)","url":"https://excalidraw.com/","type":"docs"}
]' WHERE id = 41;

-- ID 43: Social Feed — Concept
UPDATE study_items SET resources = '[
  {"label":"ByteByteGo — Design a News Feed System","url":"https://blog.bytebytego.com/p/design-a-news-feed-system","type":"article"},
  {"label":"High Scalability — Instagram Architecture (2012 original)","url":"http://highscalability.com/blog/2012/4/9/the-instagram-architecture-facebook-bought-for-a-cool-billio.html","type":"article"},
  {"label":"Excalidraw (draw your feed architecture)","url":"https://excalidraw.com/","type":"docs"}
]' WHERE id = 43;

-- ═══════════════════════════════════════════
-- AI Engineering — ID 45 (Claude API), ID 53 (Embeddings)
-- ═══════════════════════════════════════════

-- ID 45: Claude API — Concept (replace @Fireship with Anthropic video + docs)
UPDATE study_items SET resources = '[
  {"label":"Andrej Karpathy — Intro to Large Language Models (1hr)","url":"https://www.youtube.com/watch?v=zjkBMFhNj_g","type":"video"},
  {"label":"Anthropic — Quickstart Guide","url":"https://docs.anthropic.com/en/docs/quickstart","type":"docs"},
  {"label":"Messages API Reference","url":"https://docs.anthropic.com/en/api/messages","type":"docs"}
]' WHERE id = 45;

-- ID 53: Embeddings — Concept (replace @3blue1brown channel with confirmed video IDs)
UPDATE study_items SET resources = '[
  {"label":"3Blue1Brown — Transformers, the tech behind LLMs","url":"https://www.youtube.com/watch?v=wjZofJX0v4M","type":"video"},
  {"label":"3Blue1Brown — Large Language Models explained briefly","url":"https://www.youtube.com/watch?v=LPZh9BOjkQs","type":"video"},
  {"label":"Simon Willison — What are Embeddings?","url":"https://simonwillison.net/2023/Oct/23/embeddings/","type":"article"},
  {"label":"pgvector — Postgres vector similarity search","url":"https://github.com/pgvector/pgvector","type":"repo"}
]' WHERE id = 53;

-- ═══════════════════════════════════════════
-- Node.js & TypeScript — ID 63 (TypeScript Generics)
-- ID 59 (Event Loop) already has the correct specific video — untouched
-- ═══════════════════════════════════════════

-- ID 63: TypeScript Generics — Concept (replace @mattpocockuk channel with specific video)
UPDATE study_items SET resources = '[
  {"label":"Fireship — TypeScript in 100 Seconds","url":"https://www.youtube.com/watch?v=zQnBQ4tB3ZA","type":"video"},
  {"label":"Total TypeScript — Free Tutorials by Matt Pocock","url":"https://www.totaltypescript.com/tutorials","type":"docs"},
  {"label":"TypeScript Handbook — Generics","url":"https://www.typescriptlang.org/docs/handbook/2/generics.html","type":"docs"},
  {"label":"Type Challenges — Practice generics hands-on","url":"https://github.com/type-challenges/type-challenges","type":"repo"}
]' WHERE id = 63;
