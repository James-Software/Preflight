import { Sandbox } from "@vercel/sandbox";
import { closeBrowserSession } from "@/lib/browserbase";
/** Database deletion commits first; workers also stop when their run disappears. */
export async function closeDeletedProjectResources(
  resources: { kind: "sandbox" | "browserbase"; id: string }[],
) {
  await Promise.allSettled(
    resources.map(async (resource) => {
      if (resource.kind === "sandbox") {
        const sandbox = await Sandbox.get({
          name: resource.id,
          resume: false,
          signal: AbortSignal.timeout(10000),
        });
        await sandbox.stop({ signal: AbortSignal.timeout(10000) });
      } else await closeBrowserSession(resource.id);
    }),
  );
}
