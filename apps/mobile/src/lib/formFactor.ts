import { useWindowDimensions } from "react-native";

/** Phone stays a single column. Tablet uses a wider split once the short side is comfortable. */
export function useFormFactor() {
  const { width, height } = useWindowDimensions();
  const tablet = Math.min(width, height) >= 600 || width >= 768;
  const landscape = width > height;
  const columns = !tablet ? 1 : landscape && width >= 1100 ? 3 : 2;
  return { width, height, tablet, landscape, columns, contentMaxWidth: tablet ? 1120 : 720 };
}
