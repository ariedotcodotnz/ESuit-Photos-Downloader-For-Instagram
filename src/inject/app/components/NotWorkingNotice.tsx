import { APP_NAME } from "@/shared/constants";
import { appIconUrl } from "../env";

const rowStyle = {
  display: "flex",
  flexDirection: "row",
  flexWrap: "wrap",
  justifyContent: "flex-start",
  alignItems: "center",
} as const;

const iconStyle = { width: 24, height: 24, display: "block", margin: "0 8px" } as const;

/** Shown in place of the injected UI when it crashes or the viewer is logged out. */
export function NotWorkingNotice({ isLoggedIn }: { isLoggedIn: boolean }) {
  return (
    <p style={rowStyle}>
      <img src={appIconUrl()} style={iconStyle} alt="" />
      {APP_NAME}
      {isLoggedIn ? " is not working right now. Check the browser console for details." : ": you have to be logged in!"}
    </p>
  );
}
