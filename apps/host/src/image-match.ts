import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PNG } from "pngjs";

export type ImageMatchResult = {
  found: boolean;
  x?: number;
  y?: number;
  width: number;
  height: number;
  templateWidth: number;
  templateHeight: number;
};

function parsePng(path: string) {
  return PNG.sync.read(readFileSync(path));
}

function pixelEquals(a: Buffer, aIndex: number, b: Buffer, bIndex: number) {
  return a[aIndex] === b[bIndex]
    && a[aIndex + 1] === b[bIndex + 1]
    && a[aIndex + 2] === b[bIndex + 2]
    && a[aIndex + 3] === b[bIndex + 3];
}

export function findTemplateInImage(cwd: string, screenshotPath: string, templatePath: string): ImageMatchResult {
  const screenshot = parsePng(resolve(cwd, screenshotPath.replace(/^@/, "")));
  const template = parsePng(resolve(cwd, templatePath.replace(/^@/, "")));

  for (let y = 0; y <= screenshot.height - template.height; y += 1) {
    for (let x = 0; x <= screenshot.width - template.width; x += 1) {
      let matched = true;
      for (let ty = 0; ty < template.height && matched; ty += 1) {
        for (let tx = 0; tx < template.width; tx += 1) {
          const sIndex = ((y + ty) * screenshot.width + (x + tx)) * 4;
          const tIndex = (ty * template.width + tx) * 4;
          if (!pixelEquals(screenshot.data, sIndex, template.data, tIndex)) {
            matched = false;
            break;
          }
        }
      }
      if (matched) {
        return {
          found: true,
          x,
          y,
          width: screenshot.width,
          height: screenshot.height,
          templateWidth: template.width,
          templateHeight: template.height,
        };
      }
    }
  }

  return {
    found: false,
    width: screenshot.width,
    height: screenshot.height,
    templateWidth: template.width,
    templateHeight: template.height,
  };
}
