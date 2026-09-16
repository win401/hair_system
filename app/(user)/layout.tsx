import type { ReactNode } from "react";
import { WizardProvider } from "@/lib/wizard-context";

export default function UserLayout({ children }: { children: ReactNode }) {
  return <WizardProvider>{children}</WizardProvider>;
}
