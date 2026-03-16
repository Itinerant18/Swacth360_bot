# Alarm System State Machine

```mermaid
stateDiagram-v2

[*] --> Idle

Idle --> Monitoring : System Armed

Monitoring --> AlarmTriggered : Sensor Activated

AlarmTriggered --> AlertProcessing : Validate Trigger

AlertProcessing --> SendSMS : SMS Enabled
AlertProcessing --> PlaceCall : Call Enabled

SendSMS --> NotificationSent
PlaceCall --> NotificationSent

NotificationSent --> Monitoring : Reset

Monitoring --> MaintenanceMode : Walk Test

MaintenanceMode --> Monitoring : Exit Test