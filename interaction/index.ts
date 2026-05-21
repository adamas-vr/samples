
import { ColliderManager, EntityManager, GrabInteractableManager, MaterialManager, MaterialProperty, Networking, Project, RenderableManager, TransformManager } from "@adamasvr/sdk";
import { projectBundle } from "adamasvr:editor";
import { vec4 } from "gl-matrix";

Project.FromBundle(projectBundle).Launch(async (sceneGraph, project) => {
		const grabble = sceneGraph["@Network Grabble"].entityId;
		const networkHover = sceneGraph["@Network Grabble"]["@Hovered"].entityId;
		const networkSelect = sceneGraph["@Network Grabble"]["@Selected"].entityId;
		const networkAct = sceneGraph["@Network Grabble"]["@Activated"].entityId;

        const hoverState = Networking.NewVariable(
            false, 
            (onHover) => EntityManager.SetActive(networkHover, onHover)
        );

        const selectState = Networking.NewVariable(
            false, 
            (onSelect) => EntityManager.SetActive(networkSelect, onSelect)
        );

        const activateState = Networking.NewVariable(
            false, 
            (onActivate) => EntityManager.SetActive(networkAct, onActivate)
        );

        // const sendRPC = Networking.NewFunction((arg0: boolean, arg1: string) => {
        //     console.log(`arg0: ${arg0}, arg1: ${arg1}`);
        // });

        // sendRPC(false, "34")

        GrabInteractableManager.AddHoverEnteredCallback(grabble, () => {
            hoverState.value = true;
		});
		GrabInteractableManager.AddHoverExitedCallback(grabble, () => {
			hoverState.value = false;
		});
		GrabInteractableManager.AddSelectEnteredCallback(grabble, () => {
			selectState.value = true;
		});
		GrabInteractableManager.AddSelectExitedCallback(grabble, () => {
			selectState.value = false;
		});
		GrabInteractableManager.AddActivatedCallback(grabble, () => {
			activateState.value = true;
		});
		GrabInteractableManager.AddDeactivatedCallback(grabble, () => {
			activateState.value = false;
		});

        const triggerEntity = sceneGraph["@Trigger"].entityId;
        const collisionEntity = sceneGraph["@Collision"].entityId;

        const defaultColor = vec4.fromValues(78 / 255.0, 251 / 255.0, 154 / 255.0, 1.0);
        const triggerColor = vec4.fromValues(255 / 255.0, 143 / 255.0, 56 / 255.0, 1.0);
        const collsionColor = vec4.fromValues(56 / 255.0, 109 / 255.0, 255 / 255.0, 1.0);

        ColliderManager.OnTriggerEnter(triggerEntity, async (entity) => {
            const mat = await RenderableManager.GetMaterial(entity)
            MaterialManager.SetColor(mat, MaterialProperty.BaseColor, triggerColor)
        })
        ColliderManager.OnTriggerExit(triggerEntity, async (entity) => {
            const mat = await RenderableManager.GetMaterial(entity)
            MaterialManager.SetColor(mat, MaterialProperty.BaseColor, defaultColor)
        })

        ColliderManager.OnCollisionEnter(collisionEntity, async (entity) => {
            const mat = await RenderableManager.GetMaterial(entity)
            MaterialManager.SetColor(mat, MaterialProperty.BaseColor, collsionColor)
        })
        ColliderManager.OnCollisionExit(collisionEntity, async (entity) => {
            const mat = await RenderableManager.GetMaterial(entity)
            MaterialManager.SetColor(mat, MaterialProperty.BaseColor, defaultColor)
        })
});
