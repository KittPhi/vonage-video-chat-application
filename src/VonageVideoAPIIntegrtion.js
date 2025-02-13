import { store } from "./Store";
import { handleSubscribtion } from "./Store";
import OT from "@opentok/client";
import { createVonageMediaProcessor } from "@vonage/ml-transformers";

function handleError(error) {
  if (error) {
    console.log("❌ handleError:", error.message);
  }
}

let session, publisher, subscriber, processor;

export function initializeSession(apiKey, sessionId, token) {
  session = OT.initSession(apiKey, sessionId);

  // Create a publisher
  publisher = OT.initPublisher(
    "publisher",
    {
      insertMode: "append",
      style: { buttonDisplayMode: "off" },
      width: "100%",
      height: "100%",
    },
    handleError
  );

  const logPublisherEvent = (e) => {
    console.log({ name: `ℹ️ publisher [${e.type}]:`, data: e });
  };

  publisher.on({
    mediaStopped: (e) => {
      logPublisherEvent(e);
      // handleStreamStopped();
    },
    videoDisableWarningLifted: (e) => {
      logPublisherEvent(e);
    },
    videoDisabled: (e) => {
      logPublisherEvent(e);
    },
    videoEnabled: (e) => {
      logPublisherEvent(e);
    },
    destroyed: (e) => {
      logPublisherEvent(e);
    },
    mediaStreamAvailable: (e) => {
      logPublisherEvent(e);
    },
    muteForced: (e) => {
      logPublisherEvent(e);
    },
    videoDimensionsChanged: (e) => {
      logPublisherEvent(e);
    },
    videoElementCreated: (e) => {
      logPublisherEvent(e);
    },
    streamCreated: (e) => {
      logPublisherEvent(e);
    },
    streamDestroyed: (e) => {
      logPublisherEvent(e);
      // handleStreamStopped();
    },
  });

  const logSessionEvent = (e) => {
    console.log({ name: `ℹ️ session [${e.type}]:`, data: e });
  };

  // Subscribing to stream
  session.on("streamCreated", function (event) {
    subscriber = session.subscribe(
      event.stream,
      "subscriber",
      {
        insertMode: "append",
        style: { buttonDisplayMode: "off" },
        width: "100%",
        height: "100%",
      },
      handleError
    );
    store.dispatch(handleSubscribtion(true));
  });

  // Do some action on destroying the stream
  session.on("streamDestroyed", function (e) {
    logSessionEvent(e);
    store.dispatch(handleSubscribtion(false));
  });

  // Connect to the session
  session.connect(token, (error) => {
    // If the connection is successful, publish to the session
    if (error) {
      handleError(error);
    } else {
      session.publish(publisher, async (e) => {
        handleError(e);

        console.log("✅ connected!");
      });
    }
  });
}

export function handleDeviceChange(isBlurred, currentDeviceId) {
  console.log("🔄 Device change detected.");
  navigator.mediaDevices.enumerateDevices().then(async (devices) => {
    const videoDevices = devices.filter(
      (device) => device.kind === "videoinput"
    );
    const audioDevices = devices.filter(
      (device) => device.kind === "audioinput"
    );

    if (videoDevices.length === 0) {
      console.error("No video devices found.");
      // handleStreamStopped();
    } else {
      console.log("Video devices found:", videoDevices);
      const currentVideoDeviceAvailable = videoDevices.some(
        (device) => device.deviceId === currentDeviceId
      );
      if (!currentVideoDeviceAvailable) {
        console.log("Current video device is no longer available.");
        if (publisher) {
          await reinitializePublisher(videoDevices[0].deviceId, isBlurred);
        }
      } else {
        console.log("Current video device is still available.");
      }
    }

    if (audioDevices.length === 0) {
      console.error("No audio devices found.");
    } else {
      console.log("Audio devices found:", audioDevices);
      const currentAudioDeviceAvailable = audioDevices.some(
        (device) => device.deviceId === currentDeviceId
      );
      if (!currentAudioDeviceAvailable) {
        console.log("Current audio device is no longer available.");
        // Handle audio device change if necessary
      } else {
        console.log("Current audio device is still available.");
      }
    }
  });
}

export function stopStreaming() {
  session && session.unpublish(publisher);
}

export function toggleVideo(state) {
  console.log("toggleVideo", state);
  // https://tokbox.com/developer/sdks/js/reference/Publisher.html#publishVideo
  publisher.publishVideo(state, (err) => {
    if (err) {
      // error is undefined if no devices are available or if the user denied access to the camera or media is not supported.
      console.error("❌ publishVideo change ended in error:", state, err);
    } else {
      console.log("✅ publishVideo change successful:", state);
    }
  });
}

export function toggleAudio(state) {
  publisher.publishAudio(state);
}

export function toggleAudioSubscribtion(state) {
  subscriber.subscribeToAudio(state);
}

export function toggleVideoSubscribtion(state) {
  subscriber.subscribeToVideo(state);
}

export async function setVideoSource(deviceId, isBlurred) {
  if (!publisher) {
    console.error("❌ Publisher is not initialized.");
    return;
  }

  console.log(
    `🔄 Switching camera to: ${deviceId} with isBlurred: ${isBlurred}`
  );
  try {
    await publisher.setVideoSource(deviceId);
    console.log("✅ Camera switched successfully to:", deviceId);

    // ✅ Delay blur reapplication by 500ms to ensure stability
    if (isBlurred) {
      console.log("⏳ Waiting 500ms before reapplying blur...");

      await reapplyBackgroundBlur();
    }
  } catch (err) {
    console.error("❌ Error switching camera:", err);
    console.log("🔄 Reinitializing publisher due to camera switch failure...");
    await reinitializePublisher(deviceId, isBlurred);
  }
}

export async function reapplyBackgroundBlur() {
  if (!publisher) {
    console.error("❌ Publisher is not initialized.");
    return;
  }

  if (!OT.hasMediaProcessorSupport()) {
    console.error("❌ Media processor is NOT supported in this browser.");
    return;
  }

  try {
    console.log("🔄 Reapplying background blur...");

    // ✅ Always destroy the old processor before creating a new one
    if (processor) {
      console.log("🔄 Destroying old media processor...");
      await processor.disable();
      processor = null;
    }

    const config = {
      radius: "High",
      transformerType: "BackgroundBlur",
    };

    // ✅ Create a fresh media processor
    console.log("Creating new media processor...");
    processor = await createVonageMediaProcessor(config);

    console.log("Setting background options...");
    await processor.setBackgroundOptions(config);

    console.log("Enabling processor...");
    await processor.enable();

    console.log("Attempting to set video media processor connector...");
    await publisher
      .setVideoMediaProcessorConnector(processor.getConnector())
      .then(() => {
        console.log("✅ Background blur re-enabled.");
      })
      .catch((error) => {
        console.error(
          "❌ Error setting video media processor connector:",
          error
        );
      });
  } catch (error) {
    console.error("❌ Error reapplying background blur:", error);
  }
}

export async function reinitializePublisher(deviceId, isBlurred) {
  if (!session) {
    console.error("❌ Session is not initialized.");
    return;
  }

  console.log("🔄 Reinitializing publisher...");

  try {
    // Destroy the existing publisher
    if (publisher) {
      publisher.destroy();
      publisher = null;
    }

    publisher = OT.initPublisher(
      "publisher",
      {
        insertMode: "append",
        style: { buttonDisplayMode: "off" },
        width: "100%",
        height: "100%",
        videoSource: deviceId,
      },
      async (error) => {
        if (error) {
          console.error("❌ Error initializing publisher:", error);
          return;
        }

        console.log("✅ Publisher initialized.");

        if (isBlurred) {
          console.log("🔄 Applying background blur before publishing...");
          await reapplyBackgroundBlur();
        }

        session.publish(publisher, (publishError) => {
          if (publishError) {
            console.error("❌ Error publishing publisher:", publishError);
            return;
          }

          console.log("✅ Publisher reinitialized and published successfully.");
        });
      }
    );
  } catch (err) {
    console.error("❌ Error reinitializing publisher:", err);
  }
}

export async function toggleBackgroundBlur(isBlurred) {
  if (!publisher) {
    console.error("Publisher is not initialized.");
    return;
  }

  if (!OT.hasMediaProcessorSupport()) {
    console.error("Media processor is NOT supported in this browser.");
    return;
  }

  try {
    console.log("✅ toggleBackgroundBlur:", isBlurred);
    if (isBlurred) {
      // Enable blur
      const config = {
        radius: "High", // ✅ If CPU is low, try "Low"
        transformerType: "BackgroundBlur",
      };

      if (!processor) {
        console.log("Creating new media processor...");
        processor = await createVonageMediaProcessor(config);
      } else {
        console.log("Setting background options...");
        await processor.setBackgroundOptions(config);
        console.log("Enabling processor...");
        await processor.enable();
      }

      console.log("Attempting to set video media processor connector...");
      await publisher
        .setVideoMediaProcessorConnector(processor.getConnector())
        .then(() => {
          console.log("Background blur enabled.");
        })
        .catch((error) => {
          console.error(
            "Error setting video media processor connector:",
            error
          );
        });
    } else {
      // ✅ Disable blur properly. The best practice is to explicitly disable the media processor before setting the connector to null or undefined.
      if (processor) {
        console.log("Disabling processor...");
        await processor.disable(); // ✅ Explicitly disable the processor, without this could cause memory leaks
      }

      console.log("Attempting to remove video media processor connector...");
      await publisher
        .setVideoMediaProcessorConnector(null)
        .then(() => {
          console.log("Background blur disabled.");
        })
        .catch((error) => {
          console.error("Error disabling background blur:", error);
        });
    }
  } catch (error) {
    console.error("Error toggling background blur:", error);
  }
}

// Ensure VideoFrame objects are closed properly
function closeVideoFrames(frames) {
  frames.forEach((frame) => {
    if (frame && typeof frame.close === "function") {
      frame.close();
    }
  });
}

// Example usage of closeVideoFrames
// closeVideoFrames([frame1, frame2, frame3]);

export function getPublisher() {
  return publisher;
}

export function getSubscriber() {
  return subscriber;
}
