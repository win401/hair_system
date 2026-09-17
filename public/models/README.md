# Browser vision models

`face_landmarker.task` is the MediaPipe Face Landmarker float16 model used by
the `/camera` client-only AR prototype.

- Source: https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task
- Runtime: `@mediapipe/tasks-vision`
- The model is downloaded by the browser from this app. Camera frames are
  processed locally and are not uploaded by the face tracking loop.
