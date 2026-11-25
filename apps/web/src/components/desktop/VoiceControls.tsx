import type {
  DesktopVoiceBridge,
  DesktopVoiceSetupStatus,
  DesktopVoiceState,
} from "@t3tools/contracts";
import { T, useGT, Var } from "gt-react";
import { DownloadIcon, MicIcon, Volume2Icon, VolumeOffIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "../../lib/utils";
import { ComposerControl } from "../chat/ComposerControl";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

function useVoiceState(bridge: DesktopVoiceBridge | undefined) {
  const [state, setState] = useState<DesktopVoiceState | null>(null);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- subscribes to the desktop voice engine's state, outside React
  useEffect(() => bridge?.onState(setState), [bridge]);
  return state;
}

function useVoiceSetup(bridge: DesktopVoiceBridge | undefined) {
  const [status, setStatus] = useState<DesktopVoiceSetupStatus | null>(null);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- subscribes to the desktop's voice model download, outside React
  useEffect(() => bridge?.onSetup(setStatus), [bridge]);
  return status;
}

const voiceBridge = () => (typeof window === "undefined" ? undefined : window.desktopBridge?.voice);

/** Keeps a band clear above the message box where the voice orb sits, so text ends above it. */
export function VoiceOrbSlot() {
  const state = useVoiceState(voiceBridge());
  if (state === null) return null;
  return (
    <div
      aria-hidden="true"
      data-voice-orb-slot="true"
      className={cn(
        "pointer-events-none bg-linear-to-t from-background from-85% to-transparent transition-all duration-200",
        state.orb ? "h-24" : "h-0",
      )}
    />
  );
}

/** The message box's voice buttons: click to dictate, and whether replies are read aloud. */
export function VoiceControls() {
  const bridge = voiceBridge();
  const state = useVoiceState(bridge);
  const setup = useVoiceSetup(bridge);
  if (bridge && state === null && setup !== null) {
    return <VoiceSetupControl bridge={bridge} status={setup} />;
  }
  if (!bridge || state === null) return null;

  const dictateLabel = state.dictating ? "Stop dictating" : "Dictate";
  const readAloudLabel = state.readAloud ? "Stop reading replies aloud" : "Read replies aloud";
  const ReadAloudIcon = state.readAloud ? Volume2Icon : VolumeOffIcon;
  return (
    <div className="flex shrink-0 items-center gap-1">
      <Tooltip>
        <TooltipTrigger
          render={
            <ComposerControl
              className={cn("shrink-0", state.dictating && "text-primary")}
              aria-label={dictateLabel}
              aria-pressed={state.dictating}
              onClick={() => bridge.command("toggle-dictation")}
            />
          }
        >
          <MicIcon className="size-4" aria-hidden="true" />
        </TooltipTrigger>
        <TooltipPopup side="top">{dictateLabel}</TooltipPopup>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={
            <ComposerControl
              className={cn("shrink-0", state.readAloud && "text-primary")}
              aria-label={readAloudLabel}
              aria-pressed={state.readAloud}
              onClick={() => bridge.command("toggle-read-aloud")}
            />
          }
        >
          <ReadAloudIcon className="size-4" aria-hidden="true" />
        </TooltipTrigger>
        <TooltipPopup side="top">{readAloudLabel}</TooltipPopup>
      </Tooltip>
    </div>
  );
}

/** Before voice is installed: one button that downloads the local models, with its progress. */
function VoiceSetupControl(props: {
  readonly bridge: DesktopVoiceBridge;
  readonly status: DesktopVoiceSetupStatus;
}) {
  const { bridge, status } = props;
  const gt = useGT();
  const [confirming, setConfirming] = useState(false);
  const percent =
    status.totalBytes > 0 ? Math.floor((status.receivedBytes / status.totalBytes) * 100) : 0;
  const sizeGb = (status.totalBytes / 1e9).toFixed(1);
  const label =
    status.phase === "downloading"
      ? gt("Downloading voice models: {percent}%. Click to cancel.", { percent })
      : status.phase === "installing"
        ? gt("Installing voice…")
        : status.phase === "failed"
          ? gt("Voice setup failed: {error} Click to try again.", { error: status.error ?? "" })
          : gt("Set up voice");
  const onClick = () => {
    if (status.phase === "downloading") bridge.setup("cancel");
    else if (status.phase === "failed") bridge.setup("start");
    else if (status.phase === "missing") setConfirming(true);
  };
  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <ComposerControl
              className={cn("shrink-0", status.phase === "failed" && "text-destructive")}
              aria-label={label}
              disabled={status.phase === "installing"}
              onClick={onClick}
            />
          }
        >
          {status.phase === "downloading" || status.phase === "installing" ? (
            <span className="text-xs tabular-nums">{percent}%</span>
          ) : (
            <DownloadIcon className="size-4" aria-hidden="true" />
          )}
        </TooltipTrigger>
        <TooltipPopup side="top">{label}</TooltipPopup>
      </Tooltip>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>{gt("Set up local voice?")}</AlertDialogTitle>
            <AlertDialogDescription>
              <T>
                This downloads about <Var>{sizeGb}</Var> GB of speech recognition, cleanup and voice
                models from Hugging Face and GitHub. After that, dictation and spoken replies run
                entirely on this computer.
              </T>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" />}>
              <T>Cancel</T>
            </AlertDialogClose>
            <Button
              variant="default"
              onClick={() => {
                setConfirming(false);
                bridge.setup("start");
              }}
            >
              <T>Download</T>
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </>
  );
}
