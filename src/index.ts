import "./translations"

import {
	AbilityData,
	DOTA_CHAT_MESSAGE,
	DOTAScriptInventorySlot,
	dotaunitorder_t,
	Entity,
	EntityManager,
	EventsSDK,
	ExecuteOrder,
	GameState,
	Hero,
	ImageData,
	item_hand_of_midas,
	LocalPlayer,
	Menu,
	NetworkedParticle,
	PlayerCustomData,
	TaskManager,
	Unit
} from "github.com/octarine-public/wrapper/index"

new (class CAbuseMidas {
	private droppedItem: Nullable<item_hand_of_midas>
	private midasName = "item_hand_of_midas"
	private task: Nullable<bigint>

	private readonly iconNode = ImageData.GetItemTexture(this.midasName)
	private toolTip =
		"!!! Use own risk and lucky !!!\nKeep courier close to you.\nFor abuse need Hand Of Midas and 2200 gold. "

	private readonly entry = Menu.AddEntry("Utility")
	private readonly menu = this.entry.AddNode(
		"Abuse hand of midas",
		this.iconNode,
		this.toolTip
	)
	private readonly state = this.menu.AddToggle("State", false, this.toolTip)

	constructor() {
		EventsSDK.on("ChatEvent", this.ChatEvent.bind(this))
		EventsSDK.on("GameEnded", this.GameEnded.bind(this))
		EventsSDK.on("GameStarted", this.GameStarted.bind(this))
		EventsSDK.on("ParticleCreated", this.ParticleCreated.bind(this))
		EventsSDK.on("PrepareUnitOrders", this.PrepareUnitOrders.bind(this))
		EventsSDK.on("LifeStateChanged", this.LifeStateChanged.bind(this))
		this.state.OnDeactivate(() => this.reset())
	}

	private get delay() {
		return GameState.InputLag * 1000
	}

	protected GameEnded() {
		this.reset()
	}

	protected GameStarted() {
		this.reset()
	}

	protected ChatEvent(type: DOTA_CHAT_MESSAGE, value: number, ...args: number[]) {
		if (!this.state.value) {
			return
		}
		if (type !== DOTA_CHAT_MESSAGE.CHAT_MESSAGE_ITEM_PURCHASE || value !== 65) {
			return
		}
		const playerID = args.find(playerId => playerId === LocalPlayer?.PlayerID)
		if (playerID === undefined) {
			return
		}
		const playerData = PlayerCustomData.get(playerID)
		if (playerData !== undefined && !playerData.IsSpectator) {
			this.task = TaskManager.Begin(() => this.useAbuse(), this.delay)
		}
	}

	protected PrepareUnitOrders(order: ExecuteOrder): void | false {
		if (!order.Issuers.some(unit => unit === LocalPlayer?.Hero)) {
			return
		}
		const localData = this.customData()
		if (localData === undefined) {
			return
		}
		if (localData[1].IsVisibleForEnemies() && localData[1].HPPercent < 3) {
			return
		}
		if (order.OrderType !== dotaunitorder_t.DOTA_UNIT_ORDER_CAST_TARGET) {
			return
		}
		const ability = order.Ability_
		if (ability instanceof item_hand_of_midas && ability.StackCount <= 0) {
			this.droppedItem = ability
		}
	}

	protected LifeStateChanged(entity: Entity) {
		if (entity === LocalPlayer?.Hero && !entity.IsAlive) {
			this.reset()
		}
	}

	protected ParticleCreated(particle: NetworkedParticle) {
		if (particle.PathNoEcon !== "particles/items2_fx/hand_of_midas.vpcf") {
			return
		}
		const mAttached = particle.ModifiersAttachedTo
		if (mAttached === undefined) {
			return
		}
		const localData = this.customData()
		if (localData === undefined) {
			return
		}
		const [playerData, localHero] = localData
		if (!this.hasGold(playerData) || localHero !== mAttached) {
			return
		}
		if (localHero.IsVisibleForEnemies() && localHero.HPPercent < 3) {
			return
		}
		if (this.droppedItem !== undefined && this.droppedItem.StackCount <= 1) {
			const courier = this.getCourier()
			if (courier !== undefined) {
				if (courier.Position.Distance(localHero.Position) < 200) {
					localHero.PurchaseItem(25)
					localHero.PurchaseItem(64)
					this.dropMidas(this.droppedItem)
				}
			}
		}
	}
	private getCourier(): Nullable<Unit> {
		return EntityManager.AllEntities.filter(
			ent =>
				ent.RootOwner === LocalPlayer &&
				ent.IsAlive &&
				ent instanceof Unit &&
				ent.IsCourier
		).at(0) as Nullable<Unit>
	}
	private followLocalHero(courier: Unit) {
		const localHero = this.customData()?.[1]
		if (localHero !== undefined) {
			ExecuteOrder.PrepareOrder({
				orderType: dotaunitorder_t.DOTA_UNIT_ORDER_MOVE_TO_TARGET,
				issuers: [courier],
				target: localHero,
				queue: true,
				isPlayerInput: false
			})
		}
	}
	private dropMidas(midas: item_hand_of_midas) {
		if (!this.state.value) {
			return
		}
		const owner = midas.Owner

		if (owner !== undefined) {
			const courier = this.getCourier()
			if (courier !== undefined && courier !== owner) {
				owner.GiveItem(midas, courier)
			}
		}
	}

	private customData(): Nullable<[PlayerCustomData, Hero]> {
		if (!this.state.value || GameState.MapName === "hero_demo_main") {
			return
		}
		const playerTeamData = PlayerCustomData.Array.find(
			x => x.IsLocalPlayer && !x.IsSpectator
		)
		if (playerTeamData === undefined) {
			return
		}

		const localHero = playerTeamData.Hero
		if (localHero === undefined || !localHero.IsAlive) {
			return
		}
		if (localHero.IsInvulnerable || localHero.IsStunned) {
			return
		}
		return [playerTeamData, localHero]
	}

	private reset() {
		if (this.task !== undefined) {
			TaskManager.Cancel(this.task)
		}
		this.task = undefined
		this.droppedItem = undefined
	}

	private hasGold(playerData: PlayerCustomData) {
		const totalGold = playerData.UnreliableGold + playerData.ReliableGold
		const midasData = AbilityData.GetAbilityByName(this.midasName)
		return midasData !== undefined && midasData.Cost <= totalGold
	}

	private useAbuse() {
		const localData = this.customData()
		if (localData === undefined) {
			this.reset()
			return
		}

		const [, localHero] = localData
		if (this.droppedItem === undefined) {
			return
		}

		const stashMidas = localHero.TotalItems.find(
			item =>
				item instanceof item_hand_of_midas &&
				item.ItemSlot >= DOTAScriptInventorySlot.DOTA_STASH_SLOT_1 &&
				item.ItemSlot <= DOTAScriptInventorySlot.DOTA_STASH_SLOT_6
		)
		if (stashMidas !== undefined) {
			localHero.SellItem(stashMidas)
		}

		const courier = this.getCourier()
		if (courier !== undefined && courier === this.droppedItem.Owner) {
			const item = this.droppedItem
			courier.GiveItem(item, localHero, true)
			this.followLocalHero(courier)
		}
	}
})()
