import { useAtom } from "jotai";
import { aboutDialogOpenAtom } from "@/lib/atoms";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Logo } from "@/components/ui/logo";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { IconBrandGithub, IconExternalLink } from "@tabler/icons-react";
import { isElectron } from "@/lib/utils";

export function AboutDialog() {
  const [isOpen, setIsOpen] = useAtom(aboutDialogOpenAtom);
  const [version, setVersion] = useState<string>("0.1.0");

  useEffect(() => {
    if (isOpen && isElectron() && window.desktopApi?.getVersion) {
      window.desktopApi
        .getVersion()
        .then((v) => setVersion(v || "0.1.0"))
        .catch(() => setVersion("0.1.0"));
    }
  }, [isOpen]);

  const handleOpenGitHub = () => {
    window.open("https://github.com/your-repo/s-agi", "_blank");
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader className="text-center">
          <div className="flex justify-center mb-4">
            <Logo size={64} className="text-primary" />
          </div>
          <DialogTitle className="text-2xl font-bold">S-AGI</DialogTitle>
          <p className="text-sm text-muted-foreground mt-2">
            AI Agent for Spreadsheets with Univer
          </p>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="text-center">
            <p className="text-sm font-medium">Version {version}</p>
            <p className="text-xs text-muted-foreground mt-1">
              © {new Date().getFullYear()} S-AGI. All rights reserved.
            </p>
          </div>

          <div className="border-t pt-4">
            <p className="text-sm text-muted-foreground text-center mb-4">
              S-AGI es una aplicación Electron/Web para crear spreadsheets con
              AI usando Univer. Los usuarios chatean con Claude para generar,
              editar y manipular hojas de cálculo en tiempo real.
            </p>
          </div>

          <div className="flex justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleOpenGitHub}
              className="gap-2"
            >
              <IconBrandGithub size={16} />
              GitHub
              <IconExternalLink size={14} />
            </Button>
          </div>

          <div className="text-xs text-muted-foreground text-center pt-2 border-t">
            <p>Licensed under Apache-2.0</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
