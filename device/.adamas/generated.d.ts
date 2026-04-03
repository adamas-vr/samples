
import { Entity } from "@adamasvr/sdk";
import "./asset-type"

declare module "@adamasvr/sdk"{
export interface SceneGraph
{
    "@Left_Controller": {
        entityId: Entity,
        "@XRController_Thumbstick_Buttons": {
            entityId: Entity,
            "@Button_A": {
                entityId: Entity
            },
            "@Button_B": {
                entityId: Entity
            },
            "@ThumbStick": {
                entityId: Entity
            },
            "@ThumbStick_Base": {
                entityId: Entity
            }
        },
        "@Bumper": {
            entityId: Entity
        },
        "@Button_Home": {
            entityId: Entity
        },
        "@Controller_Base": {
            entityId: Entity
        },
        "@TouchPad": {
            entityId: Entity
        },
        "@Trigger": {
            entityId: Entity
        }
    },
    "@Right_Controller": {
        entityId: Entity,
        "@XRController_Thumbstick_Buttons001": {
            entityId: Entity,
            "@Button_A001": {
                entityId: Entity
            },
            "@Button_B001": {
                entityId: Entity
            },
            "@ThumbStick001": {
                entityId: Entity
            },
            "@ThumbStick_Base001": {
                entityId: Entity
            }
        },
        "@Bumper001": {
            entityId: Entity
        },
        "@Button_Home001": {
            entityId: Entity
        },
        "@Controller_Base001": {
            entityId: Entity
        },
        "@TouchPad001": {
            entityId: Entity
        },
        "@Trigger001": {
            entityId: Entity
        }
    }
}
}

export {}
