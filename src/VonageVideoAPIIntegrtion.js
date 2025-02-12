import { store } from "./Store";
import { handleSubscribtion } from "./Store";
import OT from "@opentok/client";
import { createVonageMediaProcessor } from "@vonage/ml-transformers";

function handleError(error) {
  if (error) {
    console.log("handleError:", error.message);
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
    },
  });

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
  session.on("streamDestroyed", function (event) {
    console.log("The Video chat has ended");
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

        console.log("connected!");
      });
    }
  });
}

export function stopStreaming() {
  session && session.unpublish(publisher);
}

// The following functions are used in functionlaity customization
export function toggleVideo(state) {
  console.log("toggleVideo", state);
  publisher.publishVideo(state);
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

let currentDeviceId = null;
export async function setVideoSource(deviceId) {
  if (!publisher) {
    console.error("Publisher is not initialized.");
    return;
  }

  console.log(`🔄 Switching camera to: ${deviceId}`);
  try {
    if (currentDeviceId === deviceId) {
      console.log("✅ Camera already in use, no switch needed.");
      return;
    }

    currentDeviceId = deviceId; // Update stored device ID
    await publisher.setVideoSource(deviceId);

    console.log("✅ Camera switched successfully to:", deviceId);
  } catch (err) {
    console.error("❌ Error switching camera:", err);
  }
}

export function cycleCamera() {
  if (publisher) {
    publisher
      .cycleVideo()
      .then((result) => {
        console.log("Switched to device ID:", result.deviceId);
      })
      .catch((err) => {
        console.error("Error switching video device:", err);
      });
  } else {
    console.error("Publisher is not initialized.");
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
    if (isBlurred) {
      // Enable blur
      const config = {
        radius: "High", // ✅ If CPU is low, try "Low"
        transformerType: "BackgroundBlur",
      };

      if (!processor) {
        processor = await createVonageMediaProcessor(config);
      } else {
        await processor.setBackgroundOptions(config);
        await processor.enable();
      }

      await publisher.setVideoMediaProcessorConnector(processor.getConnector());

      console.log("Background blur enabled.");
    } else {
      // ✅ Disable blur properly. The best practice is to explicitly disable the media processor before setting the connector to null or undefined.
      if (processor) {
        await processor.disable(); // ✅ Explicitly disable the processor, without this could cause memory leaks
      }

      await publisher.setVideoMediaProcessorConnector(null); // Remove the connector
      console.log("Background blur disabled.");
    }
  } catch (error) {
    console.error("Error toggling background blur:", error);
  }
}

export function getPublisher() {
  return publisher;
}

export function getSubscriber() {
  return subscriber;
}
