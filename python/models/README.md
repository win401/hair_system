# Local vision models

## `face_detection_yunet_2026may.onnx`

OpenCV YuNet face detector used to align the generated portrait to the source.

## `face_parsing_resnet18.onnx`

BiSeNet ResNet-18 face parser trained on CelebAMask-HQ. Class 17 is the hair
mask used to replace the union of the source and generated hairstyle regions.

- Source: <https://github.com/yakhyo/face-parsing>
- Download: <https://github.com/yakhyo/face-parsing/releases/download/weights/resnet18.onnx>
- License: MIT
- SHA-256: `0d9bd318e46987c3bdbfacae9e2c0f461cae1c6ac6ea6d43bbe541a91727e33f`
