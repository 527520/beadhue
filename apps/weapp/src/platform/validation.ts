import { z } from "zod";
// WeChat exposes Function but cannot execute generated validators. Configure
// Zod before loading shared schemas instead of relying on its eval probe.
z.config({ jitless: true });
