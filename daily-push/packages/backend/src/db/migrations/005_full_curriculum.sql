-- Full 5-category curriculum seed
-- Clears all existing topic/item data and seeds the new hierarchy

DELETE FROM daily_digests;
DELETE FROM study_sessions;
DELETE FROM study_items;
DELETE FROM topics;
DELETE FROM subcategories;
DELETE FROM categories;

ALTER TABLE categories AUTO_INCREMENT = 1;
ALTER TABLE subcategories AUTO_INCREMENT = 1;
ALTER TABLE topics AUTO_INCREMENT = 1;
ALTER TABLE study_items AUTO_INCREMENT = 1;

-- ══════════════════════════════════════════════════════
-- CATEGORY 1: DSA & Problem Solving
-- ══════════════════════════════════════════════════════
INSERT INTO categories (id, title, icon, description, position) VALUES
(1, 'DSA & Problem Solving', '🧠',
 'Algorithmic thinking and data structure fluency. Required for coding rounds at virtually every company. Focus on recognising patterns, not memorising solutions.',
 1);

-- Subcategory: Linear Data Structures
INSERT INTO subcategories (id, category_id, title, description, position) VALUES
(1, 1, 'Linear Data Structures', 'Arrays, strings, hashing, stacks and queues — the building blocks of 60% of all interview problems.', 1);

INSERT INTO topics (subcategory_id, title, description, position) VALUES
(1, 'Arrays & Two Pointers',
 'The two-pointer technique solves a class of problems in O(n) that naive approaches solve in O(n²). Essential for sorted arrays, palindromes, and pair-sum problems.',
 1);
SET @tid = LAST_INSERT_ID();
-- Concept session
INSERT INTO study_items (topic_id, type, title, description, resources, estimated_mins, position, status) VALUES
(@tid, 'concept', 'Two Pointer Pattern — Concept',
 'Learn the two-pointer template: one pointer from each end moving inward, or both moving in the same direction at different speeds. Understand when to use it: sorted arrays, finding pairs, removing duplicates. Watch the NeetCode explanation, then read the pattern summary.',
 '[{"label":"NeetCode — Two Pointers Playlist","url":"https://www.youtube.com/@NeetCode","type":"video"},{"label":"LeetCode — Valid Palindrome","url":"https://leetcode.com/problems/valid-palindrome/","type":"docs"},{"label":"NeetCode 150 Roadmap","url":"https://neetcode.io/roadmap","type":"docs"}]',
 25, 1, 'current');
INSERT INTO study_items (topic_id, type, title, description, resources, estimated_mins, position, status) VALUES
(@tid, 'practice', 'Arrays & Two Pointers — Practice',
 'Solve these 5 problems in order without hints first. Time yourself: 15 min per problem. After each: review the optimal solution and write down the pattern in your own words. Problems: Valid Palindrome → Two Sum II → Container With Most Water → 3Sum → Trapping Rain Water.',
 '[{"label":"Valid Palindrome","url":"https://leetcode.com/problems/valid-palindrome/","type":"docs"},{"label":"Two Sum II","url":"https://leetcode.com/problems/two-sum-ii-input-array-is-sorted/","type":"docs"},{"label":"Container With Most Water","url":"https://leetcode.com/problems/container-with-most-water/","type":"docs"},{"label":"3Sum","url":"https://leetcode.com/problems/3sum/","type":"docs"},{"label":"Trapping Rain Water","url":"https://leetcode.com/problems/trapping-rain-water/","type":"docs"}]',
 45, 2, 'queued');

INSERT INTO topics (subcategory_id, title, description, position) VALUES
(1, 'Sliding Window',
 'The sliding window pattern maintains a contiguous subarray or substring while expanding/contracting it. Solves substring and subarray problems in linear time.',
 2);
SET @tid = LAST_INSERT_ID();
INSERT INTO study_items (topic_id, type, title, description, resources, estimated_mins, position, status) VALUES
(@tid, 'concept', 'Sliding Window — Concept',
 'Two variants: fixed-size window (slide right maintaining size k) and variable-size window (expand right, contract left when condition breaks). Key insight: avoid recomputing the full window on every step. Watch NeetCode then trace through Longest Substring Without Repeating Characters by hand.',
 '[{"label":"NeetCode — Sliding Window","url":"https://www.youtube.com/@NeetCode","type":"video"},{"label":"Longest Substring Without Repeating","url":"https://leetcode.com/problems/longest-substring-without-repeating-characters/","type":"docs"}]',
 25, 1, 'queued');
INSERT INTO study_items (topic_id, type, title, description, resources, estimated_mins, position, status) VALUES
(@tid, 'practice', 'Sliding Window — Practice',
 'Solve in order: Longest Substring Without Repeating Characters → Best Time to Buy and Sell Stock → Longest Repeating Character Replacement → Minimum Window Substring (hard — attempt then review). Identify which variant (fixed or variable) each problem uses.',
 '[{"label":"Best Time to Buy/Sell Stock","url":"https://leetcode.com/problems/best-time-to-buy-and-sell-stock/","type":"docs"},{"label":"Longest Repeating Char Replacement","url":"https://leetcode.com/problems/longest-repeating-character-replacement/","type":"docs"},{"label":"Minimum Window Substring","url":"https://leetcode.com/problems/minimum-window-substring/","type":"docs"}]',
 40, 2, 'queued');

INSERT INTO topics (subcategory_id, title, description, position) VALUES
(1, 'Hashing & Prefix Sum',
 'Hash maps reduce O(n²) search problems to O(n). Prefix sums enable range query answers in O(1) after O(n) preprocessing. Two of the highest-ROI patterns.',
 3);
SET @tid = LAST_INSERT_ID();
INSERT INTO study_items (topic_id, type, title, description, resources, estimated_mins, position, status) VALUES
(@tid, 'concept', 'Hashing & Prefix Sum — Concept',
 'Hash map pattern: store seen values, look up complement in O(1). Prefix sum pattern: precompute cumulative sums so any range sum = prefix[r] - prefix[l-1]. Understand when to reach for each. Watch the NeetCode Arrays & Hashing section.',
 '[{"label":"NeetCode — Arrays & Hashing","url":"https://www.youtube.com/@NeetCode","type":"video"},{"label":"Product of Array Except Self","url":"https://leetcode.com/problems/product-of-array-except-self/","type":"docs"}]',
 25, 1, 'queued');
INSERT INTO study_items (topic_id, type, title, description, resources, estimated_mins, position, status) VALUES
(@tid, 'practice', 'Hashing & Prefix Sum — Practice',
 'Solve: Two Sum → Group Anagrams → Top K Frequent Elements → Product of Array Except Self → Subarray Sum Equals K. The last problem combines both hash map and prefix sum.',
 '[{"label":"Two Sum","url":"https://leetcode.com/problems/two-sum/","type":"docs"},{"label":"Group Anagrams","url":"https://leetcode.com/problems/group-anagrams/","type":"docs"},{"label":"Top K Frequent Elements","url":"https://leetcode.com/problems/top-k-frequent-elements/","type":"docs"},{"label":"Subarray Sum Equals K","url":"https://leetcode.com/problems/subarray-sum-equals-k/","type":"docs"}]',
 40, 2, 'queued');

INSERT INTO topics (subcategory_id, title, description, position) VALUES
(1, 'Stacks & Queues', 'Stack = LIFO, useful for matching/nesting problems. Queue = FIFO, essential for BFS. Monotonic stack is a key senior interview pattern.', 4);
SET @tid = LAST_INSERT_ID();
INSERT INTO study_items (topic_id, type, title, description, resources, estimated_mins, position, status) VALUES
(@tid, 'concept', 'Stacks & Queues — Concept',
 'Core stack problems: balanced parentheses, next greater element, daily temperatures. The monotonic stack maintains a sorted invariant as you iterate — powerful for histogram and span problems. Queues underpin BFS — covered more in Graphs.',
 '[{"label":"NeetCode — Stack","url":"https://www.youtube.com/@NeetCode","type":"video"},{"label":"Valid Parentheses","url":"https://leetcode.com/problems/valid-parentheses/","type":"docs"}]',
 25, 1, 'queued');
INSERT INTO study_items (topic_id, type, title, description, resources, estimated_mins, position, status) VALUES
(@tid, 'practice', 'Stacks & Queues — Practice',
 'Solve: Valid Parentheses → Min Stack → Evaluate Reverse Polish Notation → Daily Temperatures → Largest Rectangle in Histogram (hard — this is the ultimate monotonic stack problem).',
 '[{"label":"Min Stack","url":"https://leetcode.com/problems/min-stack/","type":"docs"},{"label":"Daily Temperatures","url":"https://leetcode.com/problems/daily-temperatures/","type":"docs"},{"label":"Largest Rectangle in Histogram","url":"https://leetcode.com/problems/largest-rectangle-in-histogram/","type":"docs"}]',
 40, 2, 'queued');

-- Subcategory: Binary Search
INSERT INTO subcategories (id, category_id, title, description, position) VALUES
(2, 1, 'Binary Search', 'Binary search in O(log n). The trick is recognising when a problem has a monotonic search space — then binary search applies even without a sorted array.', 2);

INSERT INTO topics (subcategory_id, title, description, position) VALUES
(2, 'Classic Binary Search', 'The template and its variations: find exact value, find left boundary, find right boundary. Get one template, apply it everywhere.', 1);
SET @tid = LAST_INSERT_ID();
INSERT INTO study_items (topic_id, type, title, description, resources, estimated_mins, position, status) VALUES
(@tid, 'concept', 'Binary Search — Concept',
 'Master ONE template: while left <= right, mid = left + (right-left)/2. Handle the three cases: target found, search left half, search right half. Then extend to: find first occurrence, find last occurrence, search rotated array.',
 '[{"label":"NeetCode — Binary Search","url":"https://www.youtube.com/@NeetCode","type":"video"},{"label":"Binary Search","url":"https://leetcode.com/problems/binary-search/","type":"docs"}]',
 25, 1, 'queued');
INSERT INTO study_items (topic_id, type, title, description, resources, estimated_mins, position, status) VALUES
(@tid, 'practice', 'Binary Search — Practice',
 'Solve: Binary Search → Search in Rotated Sorted Array → Find Minimum in Rotated Sorted Array → Search a 2D Matrix → Koko Eating Bananas (binary search on answer).',
 '[{"label":"Search in Rotated Array","url":"https://leetcode.com/problems/search-in-rotated-sorted-array/","type":"docs"},{"label":"Find Minimum in Rotated Array","url":"https://leetcode.com/problems/find-minimum-in-rotated-sorted-array/","type":"docs"},{"label":"Koko Eating Bananas","url":"https://leetcode.com/problems/koko-eating-bananas/","type":"docs"}]',
 40, 2, 'queued');

-- Subcategory: Trees
INSERT INTO subcategories (id, category_id, title, description, position) VALUES
(3, 1, 'Trees', 'Binary trees appear in almost every interview. Master traversals, then tackle BST properties, and finally the harder recursive problems.', 3);

INSERT INTO topics (subcategory_id, title, description, position) VALUES
(3, 'Tree Traversals — DFS & BFS', 'Inorder, preorder, postorder (all DFS), and level-order (BFS). Every tree problem is a traversal with extra logic at each node.', 1);
SET @tid = LAST_INSERT_ID();
INSERT INTO study_items (topic_id, type, title, description, resources, estimated_mins, position, status) VALUES
(@tid, 'concept', 'Tree Traversals — Concept',
 'DFS variants: preorder (root→left→right), inorder (left→root→right, gives sorted output for BST), postorder (left→right→root). BFS: use a queue, process level by level. Implement all four from memory — they are the skeleton of every tree solution.',
 '[{"label":"NeetCode — Trees Playlist","url":"https://www.youtube.com/@NeetCode","type":"video"},{"label":"Visualgo — BST","url":"https://visualgo.net/en/bst","type":"docs"},{"label":"Invert Binary Tree","url":"https://leetcode.com/problems/invert-binary-tree/","type":"docs"}]',
 30, 1, 'queued');
INSERT INTO study_items (topic_id, type, title, description, resources, estimated_mins, position, status) VALUES
(@tid, 'practice', 'Tree Traversals — Practice',
 'Solve: Invert Binary Tree → Maximum Depth of Binary Tree → Diameter of Binary Tree → Binary Tree Level Order Traversal → Lowest Common Ancestor. For each: write both recursive and iterative solutions.',
 '[{"label":"Max Depth of Binary Tree","url":"https://leetcode.com/problems/maximum-depth-of-binary-tree/","type":"docs"},{"label":"Level Order Traversal","url":"https://leetcode.com/problems/binary-tree-level-order-traversal/","type":"docs"},{"label":"Lowest Common Ancestor","url":"https://leetcode.com/problems/lowest-common-ancestor-of-a-binary-tree/","type":"docs"}]',
 45, 2, 'queued');

INSERT INTO topics (subcategory_id, title, description, position) VALUES
(3, 'Binary Search Trees', 'BST property: left < node < right. Enables O(log n) search, insert, delete. Key problems: validate BST, BST iterator, kth smallest.', 2);
SET @tid = LAST_INSERT_ID();
INSERT INTO study_items (topic_id, type, title, description, resources, estimated_mins, position, status) VALUES
(@tid, 'concept', 'Binary Search Trees — Concept',
 'BST invariant means inorder traversal gives sorted output. Validation trick: pass min/max bounds down the recursion. Insertion and deletion patterns. Understand why balanced BSTs (AVL, Red-Black) exist even if you do not implement them.',
 '[{"label":"NeetCode — BST","url":"https://www.youtube.com/@NeetCode","type":"video"},{"label":"Validate Binary Search Tree","url":"https://leetcode.com/problems/validate-binary-search-tree/","type":"docs"}]',
 25, 1, 'queued');
INSERT INTO study_items (topic_id, type, title, description, resources, estimated_mins, position, status) VALUES
(@tid, 'practice', 'Binary Search Trees — Practice',
 'Solve: Validate BST → Kth Smallest in BST → Construct BST from Preorder Traversal → Serialize and Deserialize Binary Tree.',
 '[{"label":"Kth Smallest in BST","url":"https://leetcode.com/problems/kth-smallest-element-in-a-bst/","type":"docs"},{"label":"Serialize/Deserialize Binary Tree","url":"https://leetcode.com/problems/serialize-and-deserialize-binary-tree/","type":"docs"}]',
 40, 2, 'queued');

-- Subcategory: Graphs
INSERT INTO subcategories (id, category_id, title, description, position) VALUES
(4, 1, 'Graphs', 'Graphs generalise trees. BFS for shortest paths in unweighted graphs, DFS for connectivity and cycle detection, topological sort for dependency ordering.', 4);

INSERT INTO topics (subcategory_id, title, description, position) VALUES
(4, 'Graph BFS & DFS', 'The two traversal strategies. BFS explores layer by layer (shortest path). DFS goes deep before backtracking (connected components, cycle detection).', 1);
SET @tid = LAST_INSERT_ID();
INSERT INTO study_items (topic_id, type, title, description, resources, estimated_mins, position, status) VALUES
(@tid, 'concept', 'Graph BFS & DFS — Concept',
 'Represent graphs as adjacency lists. BFS template: queue + visited set, process neighbours level by level. DFS template: recursive or stack + visited set. Key problems each solves: BFS → shortest path in unweighted graph; DFS → connected components, flood fill, cycle detection.',
 '[{"label":"NeetCode — Graphs Playlist","url":"https://www.youtube.com/@NeetCode","type":"video"},{"label":"Visualgo — Graph BFS/DFS","url":"https://visualgo.net/en/dfsbfs","type":"docs"},{"label":"Number of Islands","url":"https://leetcode.com/problems/number-of-islands/","type":"docs"}]',
 35, 1, 'queued');
INSERT INTO study_items (topic_id, type, title, description, resources, estimated_mins, position, status) VALUES
(@tid, 'practice', 'Graph BFS & DFS — Practice',
 'Solve: Number of Islands → Clone Graph → Max Area of Island → Pacific Atlantic Water Flow → Word Ladder (BFS shortest path). For Number of Islands, implement both BFS and DFS solutions.',
 '[{"label":"Clone Graph","url":"https://leetcode.com/problems/clone-graph/","type":"docs"},{"label":"Pacific Atlantic Water Flow","url":"https://leetcode.com/problems/pacific-atlantic-water-flow/","type":"docs"},{"label":"Word Ladder","url":"https://leetcode.com/problems/word-ladder/","type":"docs"}]',
 45, 2, 'queued');

INSERT INTO topics (subcategory_id, title, description, position) VALUES
(4, 'Topological Sort & Union Find', 'Topological sort orders nodes in a DAG by dependency. Union Find (Disjoint Set) tracks connected components in O(α(n)) per operation.', 2);
SET @tid = LAST_INSERT_ID();
INSERT INTO study_items (topic_id, type, title, description, resources, estimated_mins, position, status) VALUES
(@tid, 'concept', 'Topological Sort & Union Find — Concept',
 'Topological sort: Kahn algorithm (BFS with in-degrees) detects cycles and gives ordering. Use for course scheduling, build systems, dependency resolution. Union Find: path compression + union by rank makes it nearly O(1). Use for connected components in dynamic graphs.',
 '[{"label":"NeetCode — Advanced Graphs","url":"https://www.youtube.com/@NeetCode","type":"video"},{"label":"Course Schedule","url":"https://leetcode.com/problems/course-schedule/","type":"docs"}]',
 35, 1, 'queued');
INSERT INTO study_items (topic_id, type, title, description, resources, estimated_mins, position, status) VALUES
(@tid, 'practice', 'Topological Sort & Union Find — Practice',
 'Solve: Course Schedule → Course Schedule II → Number of Connected Components in Undirected Graph → Redundant Connection → Accounts Merge.',
 '[{"label":"Course Schedule II","url":"https://leetcode.com/problems/course-schedule-ii/","type":"docs"},{"label":"Redundant Connection","url":"https://leetcode.com/problems/redundant-connection/","type":"docs"},{"label":"Accounts Merge","url":"https://leetcode.com/problems/accounts-merge/","type":"docs"}]',
 45, 2, 'queued');

-- Subcategory: Dynamic Programming
INSERT INTO subcategories (id, category_id, title, description, position) VALUES
(5, 1, 'Dynamic Programming', 'DP = recursion + memoisation (top-down) or iterative table-filling (bottom-up). Focus on the 5 core patterns — you do not need hard DP for most companies.', 5);

INSERT INTO topics (subcategory_id, title, description, position) VALUES
(5, '1D Dynamic Programming', 'The entry point for DP: linear sequences where each state depends on a fixed number of previous states.', 1);
SET @tid = LAST_INSERT_ID();
INSERT INTO study_items (topic_id, type, title, description, resources, estimated_mins, position, status) VALUES
(@tid, 'concept', '1D DP — Concept',
 'Core 1D DP pattern: define dp[i] as the answer for the first i elements. Recurrence comes from the last decision made. Classic problems: climbing stairs (dp[i] = dp[i-1] + dp[i-2]), house robber (dp[i] = max(dp[i-1], dp[i-2] + nums[i])). Draw the state table before coding.',
 '[{"label":"NeetCode — 1D DP Playlist","url":"https://www.youtube.com/@NeetCode","type":"video"},{"label":"DP Patterns on LeetCode Discuss","url":"https://leetcode.com/discuss/general-discussion/458695/dynamic-programming-patterns","type":"article"},{"label":"Climbing Stairs","url":"https://leetcode.com/problems/climbing-stairs/","type":"docs"}]',
 35, 1, 'queued');
INSERT INTO study_items (topic_id, type, title, description, resources, estimated_mins, position, status) VALUES
(@tid, 'practice', '1D DP — Practice',
 'Solve in order: Climbing Stairs → House Robber → House Robber II → Longest Palindromic Substring → Palindromic Substrings → Coin Change.',
 '[{"label":"House Robber","url":"https://leetcode.com/problems/house-robber/","type":"docs"},{"label":"Coin Change","url":"https://leetcode.com/problems/coin-change/","type":"docs"},{"label":"Longest Palindromic Substring","url":"https://leetcode.com/problems/longest-palindromic-substring/","type":"docs"}]',
 45, 2, 'queued');

INSERT INTO topics (subcategory_id, title, description, position) VALUES
(5, '2D DP & Interval DP', '2D DP problems have two varying dimensions — often two sequences or a grid. The state space becomes a table.', 2);
SET @tid = LAST_INSERT_ID();
INSERT INTO study_items (topic_id, type, title, description, resources, estimated_mins, position, status) VALUES
(@tid, 'concept', '2D DP — Concept',
 '2D DP: dp[i][j] represents the answer for subproblems involving i and j. Common setups: two strings (LCS, edit distance), grid paths (unique paths), or intervals. Build the table bottom-up, filling in dependencies first.',
 '[{"label":"NeetCode — 2D DP","url":"https://www.youtube.com/@NeetCode","type":"video"},{"label":"Unique Paths","url":"https://leetcode.com/problems/unique-paths/","type":"docs"}]',
 35, 1, 'queued');
INSERT INTO study_items (topic_id, type, title, description, resources, estimated_mins, position, status) VALUES
(@tid, 'practice', '2D DP — Practice',
 'Solve: Unique Paths → Longest Common Subsequence → Edit Distance → Burst Balloons (interval DP — attempt then review). For LCS and Edit Distance, draw the 2D table before writing code.',
 '[{"label":"Longest Common Subsequence","url":"https://leetcode.com/problems/longest-common-subsequence/","type":"docs"},{"label":"Edit Distance","url":"https://leetcode.com/problems/edit-distance/","type":"docs"},{"label":"Burst Balloons","url":"https://leetcode.com/problems/burst-balloons/","type":"docs"}]',
 50, 2, 'queued');

-- Subcategory: Heaps
INSERT INTO subcategories (id, category_id, title, description, position) VALUES
(6, 1, 'Heaps & Priority Queues', 'A heap is a tree-based structure that gives O(1) access to the min or max element and O(log n) insert/remove. Essential for Top K and scheduling problems.', 6);

INSERT INTO topics (subcategory_id, title, description, position) VALUES
(6, 'Heaps & Top K Problems', 'Min-heap and max-heap. The Top K pattern: maintain a heap of size K while iterating — O(n log k) instead of O(n log n) sort.', 1);
SET @tid = LAST_INSERT_ID();
INSERT INTO study_items (topic_id, type, title, description, resources, estimated_mins, position, status) VALUES
(@tid, 'concept', 'Heaps — Concept',
 'Heap property: parent is always smaller (min-heap) or larger (max-heap) than children. heapify is O(n), push/pop is O(log n). Use a min-heap of size K for Top K largest (counter-intuitive but correct). Two heaps split for median finding.',
 '[{"label":"NeetCode — Heaps Playlist","url":"https://www.youtube.com/@NeetCode","type":"video"},{"label":"Kth Largest Element","url":"https://leetcode.com/problems/kth-largest-element-in-an-array/","type":"docs"}]',
 25, 1, 'queued');
INSERT INTO study_items (topic_id, type, title, description, resources, estimated_mins, position, status) VALUES
(@tid, 'practice', 'Heaps — Practice',
 'Solve: Kth Largest Element in an Array → Top K Frequent Elements → Find Median from Data Stream → Task Scheduler → Merge K Sorted Lists.',
 '[{"label":"Find Median from Data Stream","url":"https://leetcode.com/problems/find-median-from-data-stream/","type":"docs"},{"label":"Task Scheduler","url":"https://leetcode.com/problems/task-scheduler/","type":"docs"},{"label":"Merge K Sorted Lists","url":"https://leetcode.com/problems/merge-k-sorted-lists/","type":"docs"}]',
 45, 2, 'queued');


-- ══════════════════════════════════════════════════════
-- CATEGORY 2: System Design
-- ══════════════════════════════════════════════════════
INSERT INTO categories (id, title, icon, description, position) VALUES
(2, 'System Design', '🏗️',
 'Design scalable distributed systems. This is where senior engineers are separated from mid-level. You already know the building blocks from work — learn to articulate trade-offs under interview conditions.',
 2);

INSERT INTO subcategories (id, category_id, title, description, position) VALUES
(7, 2, 'Foundations', 'The vocabulary of every system design interview: load balancers, caches, queues, databases, CDNs. You must know what each does and when to reach for it.', 1);

INSERT INTO topics (subcategory_id, title, description, position) VALUES
(7, 'Networking & HTTP Deep Dive', 'What actually happens when a browser makes a request. TCP, DNS, HTTP/1.1 vs HTTP/2 vs HTTP/3, TLS handshake, keep-alive connections.', 1);
SET @tid = LAST_INSERT_ID();
INSERT INTO study_items (topic_id, type, title, description, resources, estimated_mins, position, status) VALUES
(@tid, 'concept', 'Networking & HTTP — Concept',
 'Walk through a full request: DNS lookup → TCP handshake → TLS → HTTP request → server processing → response. Understand: latency vs bandwidth, HTTP/2 multiplexing, WebSockets vs SSE vs long polling, status codes and their meaning in distributed systems.',
 '[{"label":"ByteByteGo — How DNS Works","url":"https://www.youtube.com/@ByteByteGo","type":"video"},{"label":"ByteByteGo — HTTP 1 vs 2 vs 3","url":"https://www.youtube.com/@ByteByteGo","type":"video"},{"label":"High Performance Browser Networking (free book)","url":"https://hpbn.co/","type":"docs"}]',
 35, 1, 'queued');
INSERT INTO study_items (topic_id, type, title, description, resources, estimated_mins, position, status) VALUES
(@tid, 'practice', 'Networking — Practice',
 'Draw from memory: the complete lifecycle of a HTTPS request including DNS, TCP, TLS, and HTTP layers. Then answer: why does HTTP/2 help with head-of-line blocking? When would you use WebSockets vs SSE in an app like Daily Push?',
 '[{"label":"ByteByteGo — A Brief History of HTTP","url":"https://www.youtube.com/@ByteByteGo","type":"video"}]',
 25, 2, 'queued');

INSERT INTO topics (subcategory_id, title, description, position) VALUES
(7, 'Load Balancing & Proxies', 'Distributing traffic across servers. Layer 4 vs Layer 7 load balancing, algorithms (round-robin, least connections, consistent hashing), health checks.', 2);
SET @tid = LAST_INSERT_ID();
INSERT INTO study_items (topic_id, type, title, description, resources, estimated_mins, position, status) VALUES
(@tid, 'concept', 'Load Balancing — Concept',
 'L4 (TCP) vs L7 (HTTP) load balancers. Algorithms: round-robin (simple), least connections (better for variable workloads), consistent hashing (minimises remapping when nodes change). Sticky sessions and when they hurt. Reverse proxy vs API gateway distinction.',
 '[{"label":"ByteByteGo — Load Balancer Explained","url":"https://www.youtube.com/@ByteByteGo","type":"video"},{"label":"System Design Primer","url":"https://github.com/donnemartin/system-design-primer","type":"repo"}]',
 30, 1, 'queued');
INSERT INTO study_items (topic_id, type, title, description, resources, estimated_mins, position, status) VALUES
(@tid, 'practice', 'Load Balancing — Practice',
 'Design exercise: you have 3 backend servers behind a load balancer. One server is slow (300ms p99 instead of 30ms). Which algorithm isolates it? What changes if sessions need affinity? Draw the architecture with and without a reverse proxy layer.',
 '[{"label":"Excalidraw","url":"https://excalidraw.com/","type":"docs"}]',
 25, 2, 'queued');

INSERT INTO topics (subcategory_id, title, description, position) VALUES
(7, 'Caching Strategies', 'Cache-aside, write-through, write-behind, read-through. Cache invalidation strategies. Redis data structures and when to use each.', 3);
SET @tid = LAST_INSERT_ID();
INSERT INTO study_items (topic_id, type, title, description, resources, estimated_mins, position, status) VALUES
(@tid, 'concept', 'Caching — Concept',
 'Four caching patterns: cache-aside (app manages cache), read-through (cache fetches on miss), write-through (write to cache + DB simultaneously), write-behind (write to cache, async to DB). Cache invalidation strategies: TTL, event-driven, cache-busting. Redis: strings, hashes, sorted sets, pub/sub. CDN caching at the edge.',
 '[{"label":"ByteByteGo — Cache Explained","url":"https://www.youtube.com/@ByteByteGo","type":"video"},{"label":"Redis University Free Course","url":"https://university.redis.com/","type":"docs"}]',
 35, 1, 'queued');
INSERT INTO study_items (topic_id, type, title, description, resources, estimated_mins, position, status) VALUES
(@tid, 'practice', 'Caching — Practice',
 'You improved API performance 30% at AgNext through query optimisation and indexing. Now extend that: design a caching layer for the same dashboard API. Which strategy (cache-aside vs read-through)? What TTL? How do you handle cache invalidation when device data updates? Document your decisions.',
 '[{"label":"ByteByteGo — Top Caching Strategies","url":"https://www.youtube.com/@ByteByteGo","type":"video"}]',
 30, 2, 'queued');

INSERT INTO topics (subcategory_id, title, description, position) VALUES
(7, 'Message Queues & Event-Driven Systems', 'Decouple producers from consumers. Kafka, RabbitMQ, SQS. At-least-once vs at-most-once vs exactly-once delivery. The fan-out pattern.', 4);
SET @tid = LAST_INSERT_ID();
INSERT INTO study_items (topic_id, type, title, description, resources, estimated_mins, position, status) VALUES
(@tid, 'concept', 'Message Queues — Concept',
 'Why queues: absorb traffic spikes, decouple services, enable async processing, retry failed work. Queue vs pub/sub distinction. Kafka: topics, partitions, consumer groups, offset management. SQS: visibility timeout, dead-letter queues. Delivery semantics and idempotency.',
 '[{"label":"ByteByteGo — Message Queue Explained","url":"https://www.youtube.com/@ByteByteGo","type":"video"},{"label":"Gaurav Sen — Kafka vs RabbitMQ","url":"https://www.youtube.com/@gkcs","type":"video"}]',
 35, 1, 'queued');
INSERT INTO study_items (topic_id, type, title, description, resources, estimated_mins, position, status) VALUES
(@tid, 'practice', 'Message Queues — Practice',
 'Design: Daily Push sends emails via a queue instead of directly in the cron job. What queue service do you use (SQS)? How do you handle failures (DLQ + retry)? How do you ensure an email is not sent twice (idempotency key)? Draw the architecture.',
 '[{"label":"AWS SQS Docs","url":"https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/welcome.html","type":"docs"}]',
 30, 2, 'queued');

INSERT INTO subcategories (id, category_id, title, description, position) VALUES
(8, 2, 'Database Design', 'Relational vs document vs columnar vs graph. Indexing, sharding, replication. The foundation of every scalable system.', 2);

INSERT INTO topics (subcategory_id, title, description, position) VALUES
(8, 'SQL vs NoSQL & When to Use Each', 'Not a religious debate — a trade-off analysis. Schema rigidity vs flexibility, ACID vs BASE, joins vs denormalisation.', 1);
SET @tid = LAST_INSERT_ID();
INSERT INTO study_items (topic_id, type, title, description, resources, estimated_mins, position, status) VALUES
(@tid, 'concept', 'SQL vs NoSQL — Concept',
 'SQL (relational): schema enforced, ACID transactions, powerful joins, vertical scaling. NoSQL: flexible schema, horizontal scaling, eventual consistency. Types of NoSQL: document (MongoDB), key-value (Redis), wide-column (Cassandra), graph (Neo4j). Rule of thumb: default to SQL, reach for NoSQL when you need massive write scale or dynamic schemas.',
 '[{"label":"ByteByteGo — SQL vs NoSQL","url":"https://www.youtube.com/@ByteByteGo","type":"video"},{"label":"Gaurav Sen — Choosing a database","url":"https://www.youtube.com/@gkcs","type":"video"}]',
 30, 1, 'queued');
INSERT INTO study_items (topic_id, type, title, description, resources, estimated_mins, position, status) VALUES
(@tid, 'practice', 'SQL vs NoSQL — Practice',
 'For each system, choose the database and justify: (1) Daily Push roadmap data (2) A real-time chat app (3) An IoT time-series sensor data store (4) A product catalogue with variable attributes (5) A social graph. Write one paragraph per decision.',
 '[{"label":"System Design Primer — Databases","url":"https://github.com/donnemartin/system-design-primer","type":"repo"}]',
 30, 2, 'queued');

INSERT INTO topics (subcategory_id, title, description, position) VALUES
(8, 'Indexing & Query Optimization', 'You optimised queries at AgNext (30% improvement). Now understand WHY: B-tree indexes, covering indexes, composite index column order, EXPLAIN plans.', 2);
SET @tid = LAST_INSERT_ID();
INSERT INTO study_items (topic_id, type, title, description, resources, estimated_mins, position, status) VALUES
(@tid, 'concept', 'Indexing — Concept',
 'B-tree index structure: why range queries work, why leading column matters in composite indexes. Index selectivity. Covering indexes (avoid table lookups). When indexes HURT (high-write tables). EXPLAIN / EXPLAIN ANALYZE — read the output, spot full table scans. N+1 query problem and how to fix it.',
 '[{"label":"Use The Index Luke — free guide","url":"https://use-the-index-luke.com/","type":"docs"},{"label":"ByteByteGo — Database Indexes Explained","url":"https://www.youtube.com/@ByteByteGo","type":"video"}]',
 35, 1, 'queued');
INSERT INTO study_items (topic_id, type, title, description, resources, estimated_mins, position, status) VALUES
(@tid, 'practice', 'Indexing — Practice',
 'Take the Daily Push schema. Run EXPLAIN on: (1) SELECT * FROM study_items WHERE status = current (2) SELECT with JOIN on study_sessions. Identify missing indexes. Add them and compare EXPLAIN output before and after. Document what changed and why.',
 '[{"label":"MySQL EXPLAIN Docs","url":"https://dev.mysql.com/doc/refman/8.0/en/explain.html","type":"docs"}]',
 35, 2, 'queued');

INSERT INTO topics (subcategory_id, title, description, position) VALUES
(8, 'Sharding & Replication', 'When one database server is not enough. Read replicas for read scale, sharding for write scale. Consistent hashing for shard assignment.', 3);
SET @tid = LAST_INSERT_ID();
INSERT INTO study_items (topic_id, type, title, description, resources, estimated_mins, position, status) VALUES
(@tid, 'concept', 'Sharding & Replication — Concept',
 'Read replicas: primary handles writes, replicas serve reads. Replication lag and consistency implications. Sharding: horizontal partitioning across multiple database servers. Shard keys — how to choose (avoid hotspots). Consistent hashing minimises data movement when adding/removing shards. Cross-shard queries are painful.',
 '[{"label":"ByteByteGo — Database Sharding","url":"https://www.youtube.com/@ByteByteGo","type":"video"},{"label":"Gaurav Sen — Consistent Hashing","url":"https://www.youtube.com/@gkcs","type":"video"}]',
 35, 1, 'queued');
INSERT INTO study_items (topic_id, type, title, description, resources, estimated_mins, position, status) VALUES
(@tid, 'practice', 'Sharding & Replication — Practice',
 'Design the database layer for a multi-tenant SaaS app with 10,000 customers. Each customer has up to 1M rows. Design: (1) read replica setup (2) shard key selection (3) how to handle a query that spans shards. Draw the architecture with connection pooling layer.',
 '[{"label":"Excalidraw","url":"https://excalidraw.com/","type":"docs"}]',
 35, 2, 'queued');

INSERT INTO subcategories (id, category_id, title, description, position) VALUES
(9, 2, 'Classic Design Problems', 'The standard problems every senior engineer must be able to design confidently. Each follows the same framework: requirements → scale → API → data model → architecture → trade-offs.', 3);

INSERT INTO topics (subcategory_id, title, description, position) VALUES
(9, 'Design a URL Shortener', 'The classic warm-up. Teaches: hashing, redirection, analytics, high read vs low write ratio.', 1);
SET @tid = LAST_INSERT_ID();
INSERT INTO study_items (topic_id, type, title, description, resources, estimated_mins, position, status) VALUES
(@tid, 'concept', 'URL Shortener — Concept',
 'Walk through the full design: (1) Requirements: shorten URLs, redirect, analytics (2) Scale: 100M URLs, 10B redirects/day (3) API: POST /shorten, GET /:code (4) Data model: urls table with code, original_url, created_at (5) Architecture: hashing (base62 encoding of ID), caching redirects in Redis, separate analytics service.',
 '[{"label":"ByteByteGo — Design URL Shortener","url":"https://www.youtube.com/@ByteByteGo","type":"video"},{"label":"System Design Primer","url":"https://github.com/donnemartin/system-design-primer","type":"repo"}]',
 35, 1, 'queued');
INSERT INTO study_items (topic_id, type, title, description, resources, estimated_mins, position, status) VALUES
(@tid, 'practice', 'URL Shortener — Practice',
 'Design it yourself in 35 minutes on Excalidraw without looking at the concept notes. Then compare. Key questions to address: what happens if two users shorten the same URL (dedup)? How do you handle custom aliases? How does analytics work without slowing down redirects?',
 '[{"label":"Excalidraw","url":"https://excalidraw.com/","type":"docs"}]',
 40, 2, 'queued');

INSERT INTO topics (subcategory_id, title, description, position) VALUES
(9, 'Design a Notification System', 'Directly maps to your Daily Push work. Multi-channel delivery (email, push, SMS), scheduling, retry logic, fan-out at scale.', 2);
SET @tid = LAST_INSERT_ID();
INSERT INTO study_items (topic_id, type, title, description, resources, estimated_mins, position, status) VALUES
(@tid, 'concept', 'Notification System — Concept',
 'Components: notification service → message queue → channel workers (email/push/SMS) → delivery providers. Fan-out: one event triggers N notifications (user follows → notify followers). At-scale fan-out strategies: push model (write to each) vs pull model (read on login). Retry with exponential backoff and dead-letter queues. You built the simple version in Daily Push — design the scaled-out version.',
 '[{"label":"ByteByteGo — Design Notification System","url":"https://www.youtube.com/@ByteByteGo","type":"video"},{"label":"Gaurav Sen — Notification at Scale","url":"https://www.youtube.com/@gkcs","type":"video"}]',
 40, 1, 'queued');
INSERT INTO study_items (topic_id, type, title, description, resources, estimated_mins, position, status) VALUES
(@tid, 'practice', 'Notification System — Practice',
 'Design from scratch in 40 minutes: a notification system for an e-commerce app. 10M users. Channels: email + push + in-app. Requirements: transactional (order confirmed), marketing (sale alert), preference management (user opt-outs). Draw the full architecture with queue topology.',
 '[{"label":"Excalidraw","url":"https://excalidraw.com/","type":"docs"}]',
 45, 2, 'queued');

INSERT INTO topics (subcategory_id, title, description, position) VALUES
(9, 'Design a Social Feed', 'The hardest common design problem. Write amplification vs read amplification, timeline aggregation, ranking.', 3);
SET @tid = LAST_INSERT_ID();
INSERT INTO study_items (topic_id, type, title, description, resources, estimated_mins, position, status) VALUES
(@tid, 'concept', 'Social Feed — Concept',
 'Two models: push (fanout on write — pre-compute feeds) vs pull (fanout on read — aggregate on request). Push: low read latency, high write cost, storage-intensive. Pull: low write cost, high read latency. Hybrid: push to active users, pull for celebrities with 10M followers. Ranking: chronological vs ML score. Pagination: cursor-based (stable) vs offset (drifts on new posts).',
 '[{"label":"Gaurav Sen — Design Instagram","url":"https://www.youtube.com/@gkcs","type":"video"},{"label":"ByteByteGo — Design a News Feed","url":"https://www.youtube.com/@ByteByteGo","type":"video"},{"label":"High Scalability — Instagram Architecture","url":"http://highscalability.com/","type":"article"}]',
 45, 1, 'queued');
INSERT INTO study_items (topic_id, type, title, description, resources, estimated_mins, position, status) VALUES
(@tid, 'practice', 'Social Feed — Practice',
 'Design Twitter timeline in 45 minutes. Handle the celebrity problem (Elon has 100M followers — do you push on write?). How does the feed stay consistent when a post is deleted? How do you paginate without missing posts that appear between requests?',
 '[{"label":"Excalidraw","url":"https://excalidraw.com/","type":"docs"},{"label":"Twitter Engineering Blog","url":"https://blog.twitter.com/engineering/en_us","type":"article"}]',
 50, 2, 'queued');


-- ══════════════════════════════════════════════════════
-- CATEGORY 3: AI Engineering
-- ══════════════════════════════════════════════════════
INSERT INTO categories (id, title, icon, description, position) VALUES
(3, 'AI Engineering', '🤖',
 'The market differentiator for senior engineers right now. You are already building with these tools in Daily Push. Formalise the knowledge so you can architect AI systems and speak about them with authority in interviews.',
 3);

INSERT INTO subcategories (id, category_id, title, description, position) VALUES
(10, 3, 'LLM API Integration', 'Hands-on: calling the Claude API, engineering prompts that work reliably, streaming, tool use, and cost control. You are already doing this — fill in the gaps.', 1);

INSERT INTO topics (subcategory_id, title, description, position) VALUES
(10, 'Claude API Fundamentals', 'The Messages API, model parameters, system vs user roles. What you already use in Daily Push, understood deeply.', 1);
SET @tid = LAST_INSERT_ID();
INSERT INTO study_items (topic_id, type, title, description, resources, estimated_mins, position, status) VALUES
(@tid, 'concept', 'Claude API — Concept',
 'Messages API structure: system (persistent context) vs user (turn input) vs assistant (model output). Key parameters: max_tokens, temperature (0=deterministic, 1=creative), top_p. Model selection trade-offs: Haiku (fast/cheap) vs Sonnet (balanced) vs Opus (most capable). Understand token counting — it determines cost and context limits.',
 '[{"label":"Anthropic Quickstart","url":"https://docs.anthropic.com/en/docs/quickstart","type":"docs"},{"label":"Messages API Reference","url":"https://docs.anthropic.com/en/api/messages","type":"docs"},{"label":"Fireship — Claude API Overview","url":"https://www.youtube.com/@Fireship","type":"video"}]',
 25, 1, 'queued');
INSERT INTO study_items (topic_id, type, title, description, resources, estimated_mins, position, status) VALUES
(@tid, 'practice', 'Claude API — Practice',
 'Open the Daily Push claude.ts service. Add: (1) a token counting call before sending to log input tokens (2) a wrapper that retries on rate limit errors with exponential backoff (3) a test that calls the API and asserts the response matches a JSON schema. Run it.',
 '[{"label":"Anthropic SDK GitHub","url":"https://github.com/anthropics/anthropic-sdk-node","type":"repo"},{"label":"Token Counting Docs","url":"https://docs.anthropic.com/en/docs/build-with-claude/token-counting","type":"docs"}]',
 35, 2, 'queued');

INSERT INTO topics (subcategory_id, title, description, position) VALUES
(10, 'Prompt Engineering', 'The craft of writing prompts that produce reliable, consistent output. Patterns: few-shot, chain-of-thought, XML structuring, role assignment.', 2);
SET @tid = LAST_INSERT_ID();
INSERT INTO study_items (topic_id, type, title, description, resources, estimated_mins, position, status) VALUES
(@tid, 'concept', 'Prompt Engineering — Concept',
 'Core patterns: (1) Zero-shot: just describe the task (2) Few-shot: give 2-3 examples before the real input (3) Chain-of-thought: ask the model to reason step by step (4) XML tags: use <instructions>, <examples>, <output> to structure complex prompts (5) Role assignment: "You are a senior engineer..." sets context. The most important insight: be specific about the output format.',
 '[{"label":"Anthropic Prompt Engineering Guide","url":"https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/overview","type":"docs"},{"label":"Anthropic Prompt Library","url":"https://docs.anthropic.com/en/prompt-library/library","type":"docs"}]',
 30, 1, 'queued');
INSERT INTO study_items (topic_id, type, title, description, resources, estimated_mins, position, status) VALUES
(@tid, 'practice', 'Prompt Engineering — Practice',
 'Take the roadmap generation prompt in roadmap.ts. Improve it: (1) add 2 few-shot examples of good study items (2) add XML structure for the output format (3) test with 3 different topics and compare output quality before and after. Document what changed.',
 '[{"label":"Anthropic Cookbook","url":"https://github.com/anthropics/anthropic-cookbook","type":"repo"}]',
 35, 2, 'queued');

INSERT INTO topics (subcategory_id, title, description, position) VALUES
(10, 'Tool Use & Function Calling', 'Define tools Claude can call. The mechanism behind every AI agent. Master the request/response loop.', 3);
SET @tid = LAST_INSERT_ID();
INSERT INTO study_items (topic_id, type, title, description, resources, estimated_mins, position, status) VALUES
(@tid, 'concept', 'Tool Use — Concept',
 'Tool use flow: (1) define tools with JSON schemas in the API request (2) Claude returns a tool_use content block when it wants to call a tool (3) you execute the tool and return the result in a tool_result block (4) Claude uses the result to generate its final answer. Well-defined tool schemas (clear descriptions, typed parameters) dramatically improve reliability.',
 '[{"label":"Anthropic Tool Use Docs","url":"https://docs.anthropic.com/en/docs/build-with-claude/tool-use","type":"docs"},{"label":"Tool Use Cookbook","url":"https://github.com/anthropics/anthropic-cookbook/tree/main/tool_use","type":"repo"}]',
 35, 1, 'queued');
INSERT INTO study_items (topic_id, type, title, description, resources, estimated_mins, position, status) VALUES
(@tid, 'practice', 'Tool Use — Practice',
 'Add a tool to the Daily Push backend: a Claude-powered chat endpoint that can call two tools: get_current_study_item() and get_streak(). The user asks "what should I study today?" and Claude calls the tools and synthesises a personalised response. Wire it to a simple text input on the Dashboard.',
 '[{"label":"Anthropic Tool Use Reference","url":"https://docs.anthropic.com/en/docs/build-with-claude/tool-use","type":"docs"}]',
 50, 2, 'queued');

INSERT INTO topics (subcategory_id, title, description, position) VALUES
(10, 'Streaming & Prompt Caching', 'Streaming makes AI feel instant. Prompt caching cuts costs by 90% on repeated calls. Both are production essentials.', 4);
SET @tid = LAST_INSERT_ID();
INSERT INTO study_items (topic_id, type, title, description, resources, estimated_mins, position, status) VALUES
(@tid, 'concept', 'Streaming & Caching — Concept',
 'Streaming: instead of waiting for the full response, receive tokens as they generate. In Node.js: use stream: true in the SDK, pipe SSE events to Express response with Content-Type: text/event-stream. Prompt caching: mark large, repeated system prompts with cache_control: {type: ephemeral}. Cache lives 5 minutes. Input tokens cost 90% less when cached. You already use this in Daily Push.',
 '[{"label":"Anthropic Streaming Docs","url":"https://docs.anthropic.com/en/api/messages-streaming","type":"docs"},{"label":"Anthropic Prompt Caching","url":"https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching","type":"docs"},{"label":"MDN — Server-Sent Events","url":"https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events","type":"docs"}]',
 30, 1, 'queued');
INSERT INTO study_items (topic_id, type, title, description, resources, estimated_mins, position, status) VALUES
(@tid, 'practice', 'Streaming & Caching — Practice',
 'Add a streaming endpoint to Daily Push: POST /api/chat/stream that accepts a user message and streams Claude responses back as SSE. Wire a simple textarea + response display to it in the Dashboard. Verify streaming works by typing a question and watching words appear incrementally.',
 '[{"label":"Anthropic SDK Streaming Example","url":"https://github.com/anthropics/anthropic-sdk-node","type":"repo"}]',
 45, 2, 'queued');

INSERT INTO subcategories (id, category_id, title, description, position) VALUES
(11, 3, 'RAG Systems', 'Retrieval Augmented Generation: give LLMs access to your private knowledge. The dominant pattern for enterprise AI applications.', 2);

INSERT INTO topics (subcategory_id, title, description, position) VALUES
(11, 'Embeddings & Vector Search', 'How text becomes searchable vectors. The math you need, the math you can skip, and how to use pgvector with your existing SQL skills.', 1);
SET @tid = LAST_INSERT_ID();
INSERT INTO study_items (topic_id, type, title, description, resources, estimated_mins, position, status) VALUES
(@tid, 'concept', 'Embeddings — Concept',
 'An embedding is a dense vector (array of floats) representing the semantic meaning of text. Similar meaning = similar direction in vector space. Cosine similarity measures the angle between vectors (0=identical, 1=opposite). You generate embeddings via an API call. pgvector adds a vector column type and <=> cosine distance operator to PostgreSQL.',
 '[{"label":"Simon Willison — What are Embeddings","url":"https://simonwillison.net/2023/Oct/23/embeddings/","type":"article"},{"label":"pgvector GitHub","url":"https://github.com/pgvector/pgvector","type":"repo"},{"label":"3Blue1Brown — Vectors","url":"https://www.youtube.com/@3blue1brown","type":"video"}]',
 25, 1, 'queued');
INSERT INTO study_items (topic_id, type, title, description, resources, estimated_mins, position, status) VALUES
(@tid, 'practice', 'Embeddings — Practice',
 'Embed the Daily Push study item descriptions using the Anthropic embeddings API. Store them in a new embeddings table with a vector column. Write a query: given a user question like "how do I get better at graphs?", embed the question and find the 3 most similar study items using cosine distance.',
 '[{"label":"Anthropic Embeddings Docs","url":"https://docs.anthropic.com/en/docs/build-with-claude/embeddings","type":"docs"},{"label":"pgvector HNSW Index","url":"https://github.com/pgvector/pgvector#hnsw","type":"repo"}]',
 50, 2, 'queued');

INSERT INTO topics (subcategory_id, title, description, position) VALUES
(11, 'End-to-End RAG Pipeline', 'Ingest → chunk → embed → retrieve → generate. Build the full pipeline and understand where each step can fail.', 2);
SET @tid = LAST_INSERT_ID();
INSERT INTO study_items (topic_id, type, title, description, resources, estimated_mins, position, status) VALUES
(@tid, 'concept', 'RAG Pipeline — Concept',
 'Five stages: (1) Ingest: load documents (PDF, web, DB) (2) Chunk: split into overlapping segments (3) Embed: convert chunks to vectors (4) Retrieve: given a query, find top-K similar chunks (5) Generate: pass retrieved chunks as context to Claude. Key decisions: chunk size, overlap, K value, how to format retrieved context in the prompt.',
 '[{"label":"Anthropic — Contextual Retrieval","url":"https://www.anthropic.com/news/contextual-retrieval","type":"article"},{"label":"Anthropic Cookbook — RAG","url":"https://github.com/anthropics/anthropic-cookbook/tree/main/skills/retrieval_augmented_generation","type":"repo"}]',
 35, 1, 'queued');
INSERT INTO study_items (topic_id, type, title, description, resources, estimated_mins, position, status) VALUES
(@tid, 'practice', 'RAG Pipeline — Practice',
 'Extend Daily Push with a Q&A feature: "ask anything about your roadmap". Ingest all study item descriptions, chunk them (each item = one chunk), embed, store. On question: embed → retrieve top 3 → pass to Claude with the question. Return Claude answer + source items. Add a simple text input to the Dashboard for this.',
 '[{"label":"pgvector","url":"https://github.com/pgvector/pgvector","type":"repo"}]',
 60, 2, 'queued');

INSERT INTO subcategories (id, category_id, title, description, position) VALUES
(12, 3, 'AI Agents', 'Agents let Claude decide which tools to call and in what order to complete a task. This is the next level beyond single-turn completions.', 3);

INSERT INTO topics (subcategory_id, title, description, position) VALUES
(12, 'Building AI Agents', 'The agentic loop: give Claude tools, let it reason about which to call, execute them, feed results back, repeat until done.', 1);
SET @tid = LAST_INSERT_ID();
INSERT INTO study_items (topic_id, type, title, description, resources, estimated_mins, position, status) VALUES
(@tid, 'concept', 'AI Agents — Concept',
 'An agent is a while loop: (1) send message + tools to Claude (2) if response contains tool_use, execute the tool (3) add tool_result to messages (4) send back to Claude (5) if response is text, return to user. Key safety concerns: infinite loops (add max_steps), tool errors (handle gracefully), context overflow (summarise history). Multi-agent: one orchestrator Claude spawns sub-agents for parallel tasks.',
 '[{"label":"Anthropic — Building Effective Agents","url":"https://www.anthropic.com/research/building-effective-agents","type":"article"},{"label":"Tool Use Cookbook","url":"https://github.com/anthropics/anthropic-cookbook/tree/main/tool_use","type":"repo"}]',
 35, 1, 'queued');
INSERT INTO study_items (topic_id, type, title, description, resources, estimated_mins, position, status) VALUES
(@tid, 'practice', 'AI Agents — Practice',
 'Build a study coach agent with 4 tools: get_current_item(), complete_item(), get_streak(), search_items(query). The agent can answer "what should I focus on this week?" by calling tools, reasoning about the results, and giving a personalised recommendation. Implement the agentic loop with max 5 iterations and proper error handling.',
 '[{"label":"Anthropic Agentic Loop Cookbook","url":"https://github.com/anthropics/anthropic-cookbook/blob/main/tool_use/automated_tool_use.ipynb","type":"repo"}]',
 60, 2, 'queued');


-- ══════════════════════════════════════════════════════
-- CATEGORY 4: Node.js & TypeScript
-- ══════════════════════════════════════════════════════
INSERT INTO categories (id, title, icon, description, position) VALUES
(4, 'Node.js & TypeScript', '⚡',
 'Deepen your existing skills. You use these daily — fill the gaps that senior-level technical screens expose. Focus on internals, performance, and type system mastery.',
 4);

INSERT INTO subcategories (id, category_id, title, description, position) VALUES
(13, 4, 'Node.js Internals', 'What makes Node fast (and what slows it down). Event loop, async patterns, streams, worker threads.', 1);

INSERT INTO topics (subcategory_id, title, description, position) VALUES
(13, 'Event Loop & Async Patterns', 'The single most important Node.js concept for senior interviews. Most devs know Node is non-blocking — you need to explain exactly why and what can break it.', 1);
SET @tid = LAST_INSERT_ID();
INSERT INTO study_items (topic_id, type, title, description, resources, estimated_mins, position, status) VALUES
(@tid, 'concept', 'Event Loop — Concept',
 'Node uses a single thread + libuv for async I/O. Event loop phases: timers (setTimeout/setInterval) → pending callbacks → idle/prepare → poll (wait for I/O) → check (setImmediate) → close callbacks. Microtask queue (Promises, process.nextTick) runs between every phase. What blocks the event loop: CPU-intensive sync code, large JSON.parse, synchronous file reads.',
 '[{"label":"Philip Roberts — What is the Event Loop (JSConf 2014)","url":"https://www.youtube.com/watch?v=8aGhZQkoFbQ","type":"video"},{"label":"Node.js Event Loop Docs","url":"https://nodejs.org/en/docs/guides/event-loop-timers-and-nexttick","type":"docs"}]',
 35, 1, 'queued');
INSERT INTO study_items (topic_id, type, title, description, resources, estimated_mins, position, status) VALUES
(@tid, 'practice', 'Event Loop — Practice',
 'Predict the output order for 5 code snippets mixing setTimeout, setImmediate, Promise.resolve, process.nextTick, and sync code. Run them to verify. Then: identify what in Daily Push could block the event loop (hint: large JSON.parse in the news aggregator) and fix it.',
 '[{"label":"Node.js Event Loop Phases","url":"https://nodejs.org/en/docs/guides/event-loop-timers-and-nexttick","type":"docs"}]',
 35, 2, 'queued');

INSERT INTO topics (subcategory_id, title, description, position) VALUES
(13, 'Streams & Performance', 'Node streams process data incrementally without loading everything into memory. Essential for file processing, proxying, and large API responses.', 2);
SET @tid = LAST_INSERT_ID();
INSERT INTO study_items (topic_id, type, title, description, resources, estimated_mins, position, status) VALUES
(@tid, 'concept', 'Streams — Concept',
 'Four stream types: Readable, Writable, Duplex, Transform. The pipe() method chains them. Backpressure: writable is slower than readable — pause the readable until the writable drains. Real use: piping a file upload to S3, streaming a CSV parse, proxying HTTP responses. You already use SSE for AI streaming — that is a Readable stream.',
 '[{"label":"Node.js Streams Docs","url":"https://nodejs.org/api/stream.html","type":"docs"},{"label":"Node.js — Backpressure Guide","url":"https://nodejs.org/en/docs/guides/backpressuring-in-streams","type":"docs"}]',
 30, 1, 'queued');
INSERT INTO study_items (topic_id, type, title, description, resources, estimated_mins, position, status) VALUES
(@tid, 'practice', 'Streams — Practice',
 'Add a data export endpoint to Daily Push: GET /api/export/sessions that streams a CSV of all study sessions without loading all rows into memory. Use a Readable stream from the DB cursor piped through a Transform stream that formats CSV rows, piped to the HTTP response.',
 '[{"label":"Node.js Streams API","url":"https://nodejs.org/api/stream.html","type":"docs"}]',
 35, 2, 'queued');

INSERT INTO subcategories (id, category_id, title, description, position) VALUES
(14, 4, 'TypeScript Mastery', 'Go beyond basic types. Generics, utility types, conditional types, and advanced patterns used in real production codebases.', 2);

INSERT INTO topics (subcategory_id, title, description, position) VALUES
(14, 'Generics & Utility Types', 'The most important TypeScript feature for library and framework authors. Used throughout the codebase you are writing.', 1);
SET @tid = LAST_INSERT_ID();
INSERT INTO study_items (topic_id, type, title, description, resources, estimated_mins, position, status) VALUES
(@tid, 'concept', 'TypeScript Generics — Concept',
 'Generics let you write code that works with any type while preserving type safety. Syntax: function identity<T>(arg: T): T. Constraints: <T extends object>. Built-in utility types: Partial<T>, Required<T>, Pick<T, K>, Omit<T, K>, Record<K, V>, ReturnType<F>, Parameters<F>, Awaited<T>. Mapped types: [K in keyof T]: T[K]. Conditional types: T extends U ? X : Y.',
 '[{"label":"Matt Pocock — TypeScript Tutorial","url":"https://www.youtube.com/@mattpocockuk","type":"video"},{"label":"TypeScript Handbook — Generics","url":"https://www.typescriptlang.org/docs/handbook/2/generics.html","type":"docs"},{"label":"Type Challenges","url":"https://github.com/type-challenges/type-challenges","type":"repo"}]',
 35, 1, 'queued');
INSERT INTO study_items (topic_id, type, title, description, resources, estimated_mins, position, status) VALUES
(@tid, 'practice', 'TypeScript Generics — Practice',
 'Implement from scratch without looking up: (1) DeepPartial<T> — makes all nested properties optional (2) NonNullable<T> — removes null and undefined (3) A generic Repository<T> class with findById(id: number): Promise<T> and save(entity: T): Promise<T>. Then solve 3 Type Challenges at the easy/medium level.',
 '[{"label":"Type Challenges","url":"https://github.com/type-challenges/type-challenges","type":"repo"}]',
 40, 2, 'queued');

INSERT INTO subcategories (id, category_id, title, description, position) VALUES
(15, 4, 'Testing', 'Testing strategy for a senior engineer: what to unit test, what to integration test, what not to mock.', 3);

INSERT INTO topics (subcategory_id, title, description, position) VALUES
(15, 'Testing Strategy & Jest', 'Unit tests for pure functions, integration tests for database and API behaviour. Know what to mock and what not to.', 1);
SET @tid = LAST_INSERT_ID();
INSERT INTO study_items (topic_id, type, title, description, resources, estimated_mins, position, status) VALUES
(@tid, 'concept', 'Testing Strategy — Concept',
 'Testing pyramid: many unit tests, some integration tests, few E2E tests. Unit test: test one function in isolation, mock all dependencies. Integration test: test the real interaction — hit a real test database, make real HTTP calls. Do NOT mock the database in integration tests — you lose confidence that queries work. Supertest lets you test Express routes without starting a server.',
 '[{"label":"Jest Docs","url":"https://jestjs.io/docs/getting-started","type":"docs"},{"label":"Supertest GitHub","url":"https://github.com/ladjs/supertest","type":"repo"}]',
 30, 1, 'queued');
INSERT INTO study_items (topic_id, type, title, description, resources, estimated_mins, position, status) VALUES
(@tid, 'practice', 'Testing — Practice',
 'Write tests for Daily Push: (1) Unit test the streakTracker.ts getStreakData() function with mocked date data (2) Integration test the GET /api/study-items/current endpoint using Supertest against a real test database (3) Integration test POST /api/study-items/:id/complete verifying the DB state changes.',
 '[{"label":"Jest","url":"https://jestjs.io/","type":"docs"},{"label":"Supertest","url":"https://github.com/ladjs/supertest","type":"repo"}]',
 45, 2, 'queued');


-- ══════════════════════════════════════════════════════
-- CATEGORY 5: Interview Preparation
-- ══════════════════════════════════════════════════════
INSERT INTO categories (id, title, icon, description, position) VALUES
(5, 'Interview Preparation', '🎯',
 'The last mile. Technical skills are table stakes — winning offers requires positioning yourself clearly, telling your story well, and negotiating from knowledge.',
 5);

INSERT INTO subcategories (id, category_id, title, description, position) VALUES
(16, 5, 'Narrative & Positioning', 'How you present yourself determines which companies reach out and how they evaluate you. AI engineering is your differentiator.', 1);

INSERT INTO topics (subcategory_id, title, description, position) VALUES
(16, 'Crafting Your AI Engineer Story', 'You are not a generic fullstack dev. You are a senior engineer who builds AI-powered systems. That is a specific, scarce, valuable profile.', 1);
SET @tid = LAST_INSERT_ID();
INSERT INTO study_items (topic_id, type, title, description, resources, estimated_mins, position, status) VALUES
(@tid, 'concept', 'Your Story — Concept',
 'Three narrative layers: (1) Foundation: 5 years building production systems at scale, IoT, CRM, microservices (2) Differentiator: you build AI-integrated applications — Daily Push is a real shipped product using Claude API, RAG, streaming (3) Direction: you are growing toward AI engineering, not just using AI tools. This story is rare: most senior devs can not build AI systems end-to-end.',
 '[{"label":"Levels.fyi — Compensation Research","url":"https://www.levels.fyi/","type":"docs"},{"label":"Haseeb Qureshi — How to Break into Tech","url":"https://haseebq.com/","type":"article"}]',
 25, 1, 'queued');
INSERT INTO study_items (topic_id, type, title, description, resources, estimated_mins, position, status) VALUES
(@tid, 'practice', 'Your Story — Practice',
 'Write three 90-second spoken intros (not scripts — bullet points you can riff from): (1) For a Series B startup: focus on shipping speed and AI integration (2) For a product company (Razorpay, Zepto, Meesho): focus on scale, systems design, NodeJS depth (3) For an AI-first company: lead with Daily Push, RAG pipeline, Claude API experience. Record yourself saying each. Review.',
 '[{"label":"LinkedIn Profile Optimisation","url":"https://www.linkedin.com/help/linkedin/answer/a549765","type":"docs"}]',
 30, 2, 'queued');

INSERT INTO subcategories (id, category_id, title, description, position) VALUES
(17, 5, 'Behavioral Interviews', 'Senior roles ask deeper, more ambiguous behavioral questions. Prepare stories, not scripts.', 2);

INSERT INTO topics (subcategory_id, title, description, position) VALUES
(17, 'STAR Stories for Senior Roles', 'Prepare 8 strong stories from your real experience at AgNext and Metacube. One story can answer multiple questions.', 1);
SET @tid = LAST_INSERT_ID();
INSERT INTO study_items (topic_id, type, title, description, resources, estimated_mins, position, status) VALUES
(@tid, 'concept', 'STAR Method — Concept',
 'STAR: Situation (30s) → Task (15s) → Action (90s, this is the meat) → Result (quantified). Senior-level questions: "Tell me about a technical decision you influenced without authority" / "Describe a project that failed and what you learned" / "When did you push back on product requirements?" / "How have you raised the bar for your team?" Each needs a real story, not a hypothetical.',
 '[{"label":"STAR Method Guide","url":"https://www.themuse.com/advice/star-interview-method","type":"article"}]',
 25, 1, 'queued');
INSERT INTO study_items (topic_id, type, title, description, resources, estimated_mins, position, status) VALUES
(@tid, 'practice', 'STAR Stories — Practice',
 'Write 8 STAR stories from your AgNext and Metacube experience. Required topics: (1) Most impactful technical decision (2) A project that went wrong (3) Mentoring or raising team quality (4) Disagreeing with a manager or senior engineer (5) Doing more than was asked (6) Introducing a new technology or process (7) Handling a production incident (8) The most complex system you designed. Write each as bullet points, not paragraphs.',
 '[{"label":"STAR Method Guide","url":"https://www.themuse.com/advice/star-interview-method","type":"article"}]',
 45, 2, 'queued');

INSERT INTO subcategories (id, category_id, title, description, position) VALUES
(18, 5, 'Offers & Negotiation', 'Negotiation is a learnable skill. One 10-minute conversation can be worth 3-6 months of salary.', 3);

INSERT INTO topics (subcategory_id, title, description, position) VALUES
(18, 'Offer Evaluation & Negotiation', 'How to evaluate total compensation, how to negotiate without burning the relationship, and how to handle competing offers.', 1);
SET @tid = LAST_INSERT_ID();
INSERT INTO study_items (topic_id, type, title, description, resources, estimated_mins, position, status) VALUES
(@tid, 'concept', 'Negotiation — Concept',
 'Rules: (1) Never give the first number — let them anchor (2) Always negotiate, even if the offer is good (3) Competing offers (real or imminent) are the strongest lever (4) Negotiate total comp: base + equity + signing bonus + benefits (5) Exploding offers are usually negotiable — ask for 48-72h extension (6) The worst they can say is no, and no one rescinds offers for politely negotiating.',
 '[{"label":"Haseeb Qureshi — Ten Rules for Negotiating","url":"https://haseebq.com/my-ten-rules-for-negotiating-a-job-offer/","type":"article"},{"label":"Levels.fyi — India Salaries","url":"https://www.levels.fyi/","type":"docs"}]',
 25, 1, 'queued');
INSERT INTO study_items (topic_id, type, title, description, resources, estimated_mins, position, status) VALUES
(@tid, 'practice', 'Negotiation — Practice',
 'Role-play (with a friend, or recorded to yourself): recruiter says "We want to offer you 25 LPA base + 5 LPA variable". Your response: (1) Thank them warmly (2) Ask about equity (3) Say you have another process in progress (4) Ask if there is flexibility on base. Practice until it feels natural. Then research market rates for your profile on Levels.fyi and LinkedIn Salary.',
 '[{"label":"Levels.fyi","url":"https://www.levels.fyi/","type":"docs"},{"label":"Glassdoor India Salaries","url":"https://www.glassdoor.co.in/Salaries/index.htm","type":"docs"}]',
 30, 2, 'queued');

-- Reset news interests for this curriculum
DELETE FROM news_interests;
INSERT INTO news_interests (tag) VALUES
('llm'), ('ai-engineering'), ('nodejs'), ('typescript'), ('system-design'),
('software-engineering'), ('react'), ('aws'), ('open-source'), ('career');
