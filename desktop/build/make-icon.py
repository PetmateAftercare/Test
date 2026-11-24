#!/usr/bin/env python3
"""앱 아이콘(build/icon.ico)을 그립니다.

가이드 페이지의 민트(#0f9d8f) 색과 같은 톤의 둥근 사각형 위에 흰 발바닥을 얹은
단순한 형태입니다. 256px 원본을 LANCZOS 로 줄여 여러 크기를 한 .ico 에 담습니다.
"""

import os

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "icon.ico")
PREVIEW = os.path.join(HERE, "icon-preview-256.png")

S = 1024  # 원본 작업 해상도


def rounded_gradient(size: int, top=(18, 168, 152), bottom=(7, 122, 112), radius_ratio=0.22) -> Image.Image:
    grad = Image.new("RGB", (size, size))
    dr = ImageDraw.Draw(grad)
    for y in range(size):
        t = y / (size - 1)
        color = tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
        dr.line([(0, y), (size, y)], fill=color)
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, 0, size - 1, size - 1], radius=int(size * radius_ratio), fill=255
    )
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(grad, (0, 0), mask)
    return out


def paw(size: int) -> Image.Image:
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    white = (255, 255, 255, 246)
    k = size / 1024.0

    def e(cx, cy, rx, ry):
        d.ellipse([cx * k - rx * k, cy * k - ry * k, cx * k + rx * k, cy * k + ry * k], fill=white)

    # 발바닥(큰 패드)
    e(512, 664, 214, 182)
    # 발가락 4개
    e(288, 420, 88, 112)
    e(432, 322, 92, 120)
    e(592, 322, 92, 120)
    e(736, 420, 88, 112)
    return layer


def main() -> None:
    base = rounded_gradient(S)
    base.alpha_composite(paw(S))
    # 살짝 위로 올려 시각적 무게 중심을 맞춤
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    img.paste(base, (0, 0))

    sizes = [16, 24, 32, 48, 64, 128, 256]
    master = img.resize((256, 256), Image.LANCZOS)
    master.save(OUT, format="ICO", sizes=[(s, s) for s in sizes])
    master.save(PREVIEW, format="PNG")
    print("wrote " + OUT + " (" + str(os.path.getsize(OUT)) + " bytes)")
    print("wrote " + PREVIEW)


if __name__ == "__main__":
    main()
