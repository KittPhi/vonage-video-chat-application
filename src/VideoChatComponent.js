import React, { useState, useEffect } from "react";
import { useSelector } from "react-redux";
import MicIcon from "@mui/icons-material/Mic";
import MicOffIcon from "@mui/icons-material/MicOff";
import VideocamIcon from "@mui/icons-material/Videocam";
import VideocamOffIcon from "@mui/icons-material/VideocamOff";
import VolumeUpIcon from "@mui/icons-material/VolumeUp";
import VolumeOffIcon from "@mui/icons-material/VolumeOff";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import SettingsIcon from "@mui/icons-material/Settings";
import {
  Tooltip,
  Button,
  Popover,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from "@mui/material";

import { apiKey, sessionId, token } from "./constants";
import {
  handleDeviceChange,
  toggleAudio,
  toggleVideo,
  toggleAudioSubscribtion,
  toggleVideoSubscribtion,
  initializeSession,
  stopStreaming,
  cycleCamera,
  toggleBackgroundBlur,
  setVideoSource,
  getPublisher,
  reapplyBackgroundBlur,
  reinitializePublisher,
} from "./VonageVideoAPIIntegrtion";
import "./VideoChatComponent.scss";

function MediaDeviceSelect({ kind, value, onChange, devices = [] }) {
  if (!devices.length) return null;

  return (
    <FormControl variant="outlined" className="device-select">
      <InputLabel>{kind}</InputLabel>
      <Select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        label={kind}
        className="device-dropdown"
      >
        {devices.map((device) => (
          <MenuItem key={device.deviceId} value={device.deviceId}>
            {device.label || `${kind} (${device.deviceId.slice(0, 8)}...)`}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}

function DeviceSettings({ devices, selectedDevices, onDeviceChange }) {
  return (
    <div className="device-settings">
      <div className="device-settings__row">
        <label>Microphone</label>
        <MediaDeviceSelect
          kind="audioinput"
          value={selectedDevices.audioInput}
          onChange={(deviceId) => onDeviceChange("audioInput", deviceId)}
          devices={devices.audioInputs}
        />
      </div>
      <div className="device-settings__row">
        <label>Speaker</label>
        <MediaDeviceSelect
          kind="audiooutput"
          value={selectedDevices.audioOutput}
          onChange={(deviceId) => onDeviceChange("audioOutput", deviceId)}
          devices={devices.audioOutputs}
        />
      </div>
      <div className="device-settings__row">
        <label>Camera</label>
        <MediaDeviceSelect
          kind="videoinput"
          value={selectedDevices.videoInput}
          onChange={(deviceId) => onDeviceChange("videoInput", deviceId)}
          devices={devices.videoInputs}
        />
      </div>
    </div>
  );
}

function VideoChatComponent() {
  const [isInterviewStarted, setIsInterviewStarted] = useState(false);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioSubscribed, setIsAudioSubscribed] = useState(true);
  const [isVideoSubscribed, setIsVideoSubscribed] = useState(true);
  const [isStreamSubscribed, setIsStreamSubscribed] = useState(false);
  const [devices, setDevices] = useState({
    audioInputs: [],
    audioOutputs: [],
    videoInputs: [],
  });
  const [selectedDevices, setSelectedDevices] = useState({
    audioInput: "",
    audioOutput: "",
    videoInput: "",
  });
  const [settingsAnchorEl, setSettingsAnchorEl] = useState(null);
  const [currentDeviceId, setCurrentDeviceId] = useState(null);

  const isSubscribed = useSelector(
    (state) => state.videoChat.isStreamSubscribed
  );

  const [isBlurred, setIsBlurred] = useState(false);

  // Initially called, is used to list all available devices (audio inputs, audio outputs, and video inputs).
  useEffect(() => {
    const enumerateDevices = async () => {
      try {
        const mediaDevices = await navigator.mediaDevices.enumerateDevices();
        const groupedDevices = {
          audioInputs: mediaDevices.filter(
            (device) => device.kind === "audioinput"
          ),
          audioOutputs: mediaDevices.filter(
            (device) => device.kind === "audiooutput"
          ),
          videoInputs: mediaDevices.filter(
            (device) => device.kind === "videoinput"
          ),
        };
        setDevices(groupedDevices);

        // Set initial device selections
        setSelectedDevices({
          audioInput: groupedDevices.audioInputs[0]?.deviceId || "",
          audioOutput: groupedDevices.audioOutputs[0]?.deviceId || "",
          videoInput: groupedDevices.videoInputs[0]?.deviceId || "",
        });
      } catch (error) {
        console.error("Error enumerating devices:", error);
      }
    };

    enumerateDevices();
    navigator.mediaDevices.addEventListener("devicechange", enumerateDevices);

    return () => {
      navigator.mediaDevices.removeEventListener(
        "devicechange",
        enumerateDevices
      );
    };
  }, []);

  useEffect(() => {
    const handleDeviceChangeWithBlur = () =>
      handleDeviceChange(isBlurred, currentDeviceId);
    navigator.mediaDevices.addEventListener(
      "devicechange",
      handleDeviceChangeWithBlur
    );

    return () => {
      navigator.mediaDevices.removeEventListener(
        "devicechange",
        handleDeviceChangeWithBlur
      );
    };
  }, [isBlurred, currentDeviceId]);

  useEffect(() => {
    isInterviewStarted
      ? initializeSession(apiKey, sessionId, token)
      : stopStreaming();
  }, [isInterviewStarted]);

  useEffect(() => {
    setIsStreamSubscribed(isSubscribed);
  }, [isSubscribed]);

  const handleSwitchCamera = async (type, deviceId) => {
    console.log(`🔄 handleSwitchCamera ${type} to: ${deviceId}`);
    setSelectedDevices((prev) => ({ ...prev, [type]: deviceId }));

    if (type === "videoInput") {
      const publisher = getPublisher();
      if (!publisher) {
        console.error("❌ Publisher is not initialized.");
        return;
      }

      // ✅ Before switching cameras, check if video was disabled
      const wasVideoEnabled = isVideoEnabled;

      try {
        // ✅ Switch the camera source
        await setVideoSource(deviceId, isBlurred);

        // ✅ Ensure video remains disabled if it was disabled before
        if (!wasVideoEnabled) {
          publisher.publishVideo(false);
        }

        // ✅ Restore the correct UI toggle state
        setIsVideoEnabled(wasVideoEnabled);

        // ✅ Apply background blur if it is enabled
        if (isBlurred) {
          await reapplyBackgroundBlur();
        }
      } catch (err) {
        console.error("❌ Error switching camera:", err);

        // ✅ Pass `isBlurred` to ensure blur is reapplied after reinitialization
        await reinitializePublisher(deviceId, isBlurred);
      }

      // Update the current device ID state
      setCurrentDeviceId(deviceId);
    } else {
      console.log(`✅ ${type} switched successfully to: ${deviceId}`);
    }
  };

  const handleSettingsClick = (event) => {
    setSettingsAnchorEl(event.currentTarget);
  };

  const handleSettingsClose = () => {
    setSettingsAnchorEl(null);
  };

  const onToggleAudio = (action) => {
    setIsAudioEnabled(action);
    toggleAudio(action);
  };
  const onToggleVideo = (action) => {
    setIsVideoEnabled(action);
    toggleVideo(action);
  };
  const onToggleAudioSubscribtion = (action) => {
    setIsAudioSubscribed(action);
    toggleAudioSubscribtion(action);
  };
  const onToggleVideoSubscribtion = (action) => {
    setIsVideoSubscribed(action);
    toggleVideoSubscribtion(action);
  };

  const onToggleBackgroundBlur = () => {
    const newBlurState = !isBlurred;
    setIsBlurred(newBlurState);
    toggleBackgroundBlur(newBlurState);
  };

  const renderToolbar = () => {
    return (
      <>
        {isInterviewStarted && (
          <div className="video-toolbar">
            {isAudioEnabled ? (
              <Tooltip title="Mic On">
                <MicIcon
                  onClick={() => onToggleAudio(false)}
                  className="on-icon"
                />
              </Tooltip>
            ) : (
              <Tooltip title="Mic Off">
                <MicOffIcon
                  onClick={() => onToggleAudio(true)}
                  className="off-icon"
                />
              </Tooltip>
            )}
            {isVideoEnabled ? (
              <Tooltip title="Camera On">
                <VideocamIcon
                  onClick={() => onToggleVideo(false)}
                  className="on-icon"
                />
              </Tooltip>
            ) : (
              <Tooltip title="Camera Off">
                <VideocamOffIcon
                  onClick={() => onToggleVideo(true)}
                  className="off-icon"
                />
              </Tooltip>
            )}

            {/* NEW: Add Toggle Background Blur Button */}
            <Tooltip title={isBlurred ? "Disable Blur" : "Enable Blur"}>
              <Button
                onClick={onToggleBackgroundBlur}
                variant="contained"
                color={isBlurred ? "secondary" : "primary"}
                style={{ marginLeft: "10px" }}
              >
                {isBlurred ? "Disable Blur" : "Enable Blur"}
              </Button>
            </Tooltip>

            {/* <Tooltip title="Switch Camera">
              <Button
                onClick={cycleCamera}
                variant="contained"
                color="primary"
                style={{ marginLeft: "10px" }}
              >
                Switch Camera
              </Button>
            </Tooltip> */}

            <Tooltip title="Settings">
              <SettingsIcon onClick={handleSettingsClick} className="on-icon" />
            </Tooltip>
            <Popover
              open={Boolean(settingsAnchorEl)}
              anchorEl={settingsAnchorEl}
              onClose={handleSettingsClose}
              anchorOrigin={{
                vertical: "bottom",
                horizontal: "center",
              }}
              transformOrigin={{
                vertical: "top",
                horizontal: "center",
              }}
            >
              <DeviceSettings
                devices={devices}
                selectedDevices={selectedDevices}
                onDeviceChange={handleSwitchCamera}
              />
            </Popover>
          </div>
        )}
      </>
    );
  };

  return (
    <>
      <div className="actions-btns">
        <Button
          onClick={() => setIsInterviewStarted(true)}
          disabled={isInterviewStarted}
          color="primary"
          variant="contained"
        >
          Start chat
        </Button>
        <Button
          onClick={() => setIsInterviewStarted(false)}
          disabled={!isInterviewStarted}
          color="secondary"
          variant="contained"
        >
          Finish chat
        </Button>
      </div>
      <div className="video-container">
        <div
          id="subscriber"
          className={`${
            isStreamSubscribed ? "main-video" : "additional-video"
          }`}
        >
          {isStreamSubscribed && renderToolbar()}
        </div>
        <div
          id="publisher"
          className={`${
            isStreamSubscribed ? "additional-video" : "main-video"
          }`}
        >
          {!isStreamSubscribed && renderToolbar()}
        </div>
      </div>
    </>
  );
}

export default VideoChatComponent;
