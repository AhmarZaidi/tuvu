# Platform Constraints & Available Infrastructure

When planning or building this project, adhere to the following infrastructure availability and free-tier constraints. These resources are shared across multiple personal projects, meaning efficiency and resource conservation are critical.

## 1. Cloudflare Ecosystem (Cardless Free Tier)

- **Cloudflare Workers (Edge Compute)**
    - **Info:** A serverless platform for building, deploying, and scaling apps across Cloudflare's global network with a single command. Delivers fast performance, supports full-stack apps (React, Vue, Svelte, etc.) and preferred languages (JS, TS, Python, Rust).
    - **Rate Limits:** 100,000 requests per day.
    - **CPU Limits:** 10 milliseconds of active CPU time per request.
    - **Subrequests:** 50 outgoing requests per Worker invocation.
- **Cloudflare Pages (Frontend Hosting)**
    - **Builds:** 500 builds per month.
    - **Bandwidth:** Unlimited (subject to fair use).
    - **Custom domains:** 100
    - **Files:** Cloudflare Pages sites can contain up to 20,000 files on the Free plan.
    - **File size:** The maximum file size for a single Cloudflare Pages site asset is 25 MiB.
    - **Functions:** Requests to Pages functions count towards your quota for Workers plans, including requests from your Function to KV or Durable Object bindings.
    - **Headers:** A `_headers` file can have a maximum of 100 header rules. An individual header in a `_headers` file can have a maximum of 2,000 characters. For managing larger headers, it is recommended to implement Pages Functions.
    - **Preview deployments:** You can have an unlimited number of preview deployments active on your project at a time.
    - **Redirects:** A `_redirects` file can have a maximum of 2,000 
    static redirects and 100 dynamic redirects, for a combined total of 
    2,100 redirects. It is recommended to use Bulk Redirects when you have a need for more than the `_redirects` file supports.
    - **Projects:** Cloudflare Pages has a limit of 100 projects per account.
- **Cloudflare D1 (Serverless SQLite)**
    - **Maximum database size:** 500 MB (no single project can have a DB size larger than 500 MB).
    - **Maximum storage per account:** 5GB total storage.
    - **Queries:** 5 million read rows / 100,000 write rows per day.
    - **Queries per Worker invocation:** 50.
    - **Maximum number of columns per table:** 100.
    - **Maximum string, BLOB or table row size:** 2,000,000 bytes (2 MB).
    - **Maximum SQL statement length:** 100,000 bytes (100 KB).
    - **Maximum bound parameters per query:** 100.
    - **Maximum arguments per SQL function:** 32.
    - **Maximum bindings per Workers script:** Approximately 5,000 (excluding env vars).
    - **Maximum SQL query duration:** 30 seconds (Cloudflare API request limit).
    - **Batch limits:** Individual query limits apply to each statement inside a `db.batch()`.
    - **Concurrency:** D1 is single-threaded per DB. 1ms queries allow ~1,000 QPS. Heavy concurrent requests will queue, then return "overloaded" errors.
    - **Simultaneous connections:** Up to 6 connections to D1 per Worker invocation.
- **Cloudflare KV (Key-Value Store)**
    - **Reads:** 100,000 reads per day.
    - **Writes to different keys:** 1,000 writes per day.
    - **Writes to same key:** 1 per second.
    - **Operations/Worker invocation:** 1,000 external operations.
    - **Namespaces per account:** 1000.
    - **Storage (Account & Namespace):** 1 GB.
    - **Key size:** 512 bytes | **Key metadata:** 1024 bytes | **Value size:** 25 MiB.
    - **Minimum cacheTtl:** 30 seconds.
- **Durable Objects (SQLite-backed ONLY on Free Plan)**
    - **Info:** Stateful serverless application coordination with attached durable storage.
    - **Workers Free plan limitation:** Only Durable Objects with the SQLite storage backend are available on the cardless free tier.
    - **Number of Objects:** Unlimited.
    - **Maximum DO classes (per account):** 100.
    - **Storage:** 5 GB per account (combined limit).
    - **Key/Value size:** Combined cannot exceed 2 MB.
    - **WebSocket message size:** 32 MiB (received).
    - **CPU per request:** 30 seconds (resets on incoming requests).
    - **Simultaneous outgoing connections:** 6.
    - **Throughput:** Soft limit of 1,000 requests per second per individual Object.
    - **Storage full behavior:** When 1GB is reached, writes (INSERT, UPDATE) fail with `SQLITE_FULL`. Reads and DELETEs continue to work.
    - **Wall time limits:** HTTP/WebSockets (Unlimited while connected), Cron/Queues/Alarms (15 minutes).
- **Cloudflare Queues**
    - **Info:** Message buffering, batching, and guaranteed delivery between Workers.
    - **Limits:** 100,000 operations per month. Message Retention is non-configurable at 24 hours for the Free plan.
- **Cloudflare Workers AI**
    - **Info:** Serverless inference running on Cloudflare GPUs.
    - **Rate Limits (Requests per minute):**
        - Automatic Speech Recognition: 720
        - Image Classification / Object Detection / Text Embeddings: 3,000
        - Image-to-Text / Translation / Text-to-Image (Base): 720
        - Summarization / Text Classification: 1,500 - 2,000
        - Text Generation: Varies by model (300 to 1,500).
- **Cloudflare Vectorize**
    - **Info:** Globally distributed vector database for embeddings and AI semantic search.
    - **Limits:** 30 million queried dimensions per month; 5 million queried vectors per month.
- **Cloudflare Hyperdrive & AI Search**
    - **Hyperdrive:** Accelerates existing Postgres/MySQL connections globally.
    - **AI Search:** Retrieval infrastructure for natural language data searching (built on Vectorize/Workers AI).
- **API Token Limits**
    - **Global Rate Limit:** 1,200 requests / 5 minutes per user. Blocked with HTTP 429 if exceeded.
    - **Client API:** 1200 / 5 mins (per user/token), 200 / second (per IP).
    - **User/Account API token quotas:** 50 (User) / 500 (Account).

## 2. Unavailable Services (DO NOT USE)

*CRITICAL: The following services require a credit card, payment method, or paid subscription to function. Do not architect solutions requiring these.*

- **Cloudflare R2** (Object Storage)
- **Cloudflare Images / Image Resizing** (Requires paid subscription/billing profile)
- **Cloudflare Containers**
- **Cloudflare Email Sending** (Outbound transactional email)

## 3. Supabase Ecosystem (Free Tier)

- **Postgres Database:**
    - **Storage:** 500MB database space.
    - **Compute:** Micro instance (shared CPU with 500 MB RAM).
    - **Pausing:** Projects are paused after 1 week of inactivity (must handle cold starts or keep-alive pings).
- **Supabase Storage (Object Storage):** 1GB total storage. Individual file uploads max 50 MB.
- **Supabase Auth:** 50,000 Monthly Active Users (MAU).
- **Supabase Realtime:** 200 concurrent connections; 2 million messages per month.
- **Edge Functions:** Serverless Deno-based functions with up to 500,000 monthly invocations.
- **Network & Bandwidth:** 5 GB of data egress and 5 GB of cached egress per month. API requests are unlimited.
- **Project Cap:** Maximum of 2 active projects simultaneously under one account.

## 4. General Architectural Rules

- **Shared Pool:** All limits above represent the *total* pool available across all active projects. Designs must minimize CPU, reads, writes, and storage.
- **Cardless Requirement:** 100% of the infrastructure must be accessible without providing credit card or payment information. Any service that requires a card for overage protection is strictly forbidden.
- **Security & Reliability:** Only utilize trusted, production-grade platforms.
- **Platform Flexibility:** While Cloudflare and Supabase are the primary stack, if new, equally reliable, secure, and 100% free (cardless) platforms become available at the time of project creation, they may be proposed as alternatives or additions to this infrastructure.