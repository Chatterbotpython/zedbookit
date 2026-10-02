import * as ImageManipulator from "expo-image-manipulator";

/**
 * Compresses/resizes an image before upload to keep Firebase Storage usage
 * (and mobile data usage for Zambian users) low. Property/maintenance photos
 * rarely need to exceed 1600px on the long edge for a good in-app viewing
 * experience, and JPEG at 0.7 quality is a good size/quality trade-off.
 */
export async function compressImageForUpload(uri: string): Promise<string> {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 1600 } }],
    { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
  );
  return result.uri;
}
