import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { IoArrowDown, IoArrowUp, IoClose, IoLink, IoReorderTwo, IoUnlink } from "react-icons/io5";
import type { MatchPlayer } from "@scheisse/shared";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { IconButton, cx } from "../../ui";
import styles from "./SeatList.module.css";

interface SeatListProps {
  players: MatchPlayer[];
  onReorder: (orderedIds: string[]) => void;
  onRemove?: (id: string) => void;
  /** Id of a player to mark (e.g. the giver). */
  markId?: string;
  /** Opens the link / unlink dialog for a seat. */
  onLink?: (player: MatchPlayer) => void;
}

function SeatItem({
  player,
  index,
  count,
  onMove,
  onRemove,
  onLink,
  mark,
}: {
  player: MatchPlayer;
  index: number;
  count: number;
  onMove: (from: number, to: number) => void;
  onRemove?: ((id: string) => void) | undefined;
  onLink?: ((p: MatchPlayer) => void) | undefined;
  mark: boolean;
}) {
  const reduce = useReducedMotion();
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: player.id,
  });
  return (
    <li
      ref={setNodeRef}
      className={styles.item}
      style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 5 : undefined, opacity: isDragging ? 0.85 : 1 }}
      data-testid={`seat-${player.id}`}
    >
      <motion.div
        className={cx(styles.row, index % 2 === 1 && styles.alt)}
        layout={!reduce}
        initial={reduce ? false : { opacity: 0, x: -24, height: 0 }}
        animate={{ opacity: 1, x: 0, height: "auto" }}
        exit={reduce ? undefined : { opacity: 0, x: 40, height: 0 }}
        transition={{ type: "spring", stiffness: 420, damping: 36 }}
      >
        <button
          type="button"
          ref={setActivatorNodeRef}
          className={styles.handle}
          aria-label={`${player.name} verschieben`}
          {...attributes}
          {...listeners}
        >
          <IoReorderTwo aria-hidden="true" />
        </button>
        <span className={styles.seat}>{index + 1}.</span>
        <span className={styles.name}>
          <span className={styles.nameText} title={player.name}>{player.name}</span>
          {mark && <span className={styles.giver}>Geber</span>}
          <span className={player.userId ? styles.badgeUser : styles.badge}>{player.userId ? "Konto" : "Gast"}</span>
        </span>
        <span className={styles.actions}>
          {onLink && (
            <IconButton
              label={player.userId ? `Verknüpfung von ${player.name} lösen` : `${player.name} mit Konto verknüpfen`}
              size="sm"
              onClick={() => onLink(player)}
            >
              {player.userId ? <IoUnlink /> : <IoLink />}
            </IconButton>
          )}
          <span className={styles.move}>
          <IconButton label={`${player.name} nach oben`} size="sm" disabled={index === 0} onClick={() => onMove(index, index - 1)}>
            <IoArrowUp />
          </IconButton>
          <IconButton
            label={`${player.name} nach unten`}
            size="sm"
            disabled={index === count - 1}
            onClick={() => onMove(index, index + 1)}
          >
            <IoArrowDown />
          </IconButton>
          </span>
          {onRemove && (
            <IconButton label={`${player.name} entfernen`} size="sm" tone="danger" onClick={() => onRemove(player.id)}>
              <IoClose />
            </IconButton>
          )}
        </span>
      </motion.div>
    </li>
  );
}

/** Sortable seat list (drag handle + arrows). Used in setup and in the settings dialog. */
export function SeatList({ players, onReorder, onRemove, markId, onLink }: SeatListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = players.map((p) => p.id);

  const move = (from: number, to: number) => {
    if (to < 0 || to >= ids.length) return;
    onReorder(arrayMove(ids, from, to));
  };

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from >= 0 && to >= 0) move(from, to);
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ol className={styles.list}>
          <AnimatePresence initial={false}>
          {players.map((p, i) => (
            <SeatItem key={p.id} player={p} index={i} count={players.length} onMove={move} onRemove={onRemove} onLink={onLink} mark={p.id === markId} />
          ))}
          </AnimatePresence>
        </ol>
      </SortableContext>
    </DndContext>
  );
}
