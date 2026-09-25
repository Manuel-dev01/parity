import { permanentRedirect } from "next/navigation";

/** Board and Tape merged into Markets; the old URL keeps working. */
export default function Tape(): never {
  permanentRedirect("/markets");
}
